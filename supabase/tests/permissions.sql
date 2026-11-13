-- Permission tests for the column-level UPDATE grants (security fix S1).
--
-- Proves that a group member can't take over a group (created_by), change its join code, or
-- rewrite protected expense/profile columns, while everything the app does still works:
-- group settings, save_expense create and edit, receipts, "stop repeating", recurring copies,
-- profile edits, regenerate_join_code, and the creator deleting the group.
--
-- Run it on a THROWAWAY database after schema.sql and the migrations, e.g. a local Supabase
-- (`supabase start`) via psql, or with `node supabase/tests/run-pglite.mjs` (no Supabase needed).
-- Everything runs in one transaction that is rolled back, so it leaves nothing behind.
-- Each check prints PASS or FAIL; the last statement raises an error if anything failed.

begin;

select set_config('test.checks', '0', true), set_config('test.failures', '0', true);

-- ------------------------------------------------------------
-- Helpers (temporary, gone after the rollback). They run as the calling role, so the
-- statements they execute are checked against that role's privileges and RLS.
-- ------------------------------------------------------------

create function pg_temp.record(ok boolean, label text, detail text default null)
returns text language plpgsql as $$
declare
  line text;
begin
  perform set_config('test.checks', (current_setting('test.checks')::int + 1)::text, true);
  if ok then
    line := 'PASS  ' || label;
  else
    perform set_config('test.failures', (current_setting('test.failures')::int + 1)::text, true);
    line := 'FAIL  ' || label || coalesce(' (' || detail || ')', '');
  end if;
  raise notice '%', line;
  return line;
end;
$$;

-- Passes only on "permission denied" (a privilege error, not an RLS one). If the statement
-- succeeds, its changes are undone so later checks see the original data.
create function pg_temp.expect_denied(label text, stmt text)
returns text language plpgsql as $$
begin
  begin
    execute stmt;
    raise exception 'permission test: statement succeeded';
  exception
    when insufficient_privilege then
      if sqlerrm like 'permission denied%' then
        return pg_temp.record(true, label);
      end if;
      return pg_temp.record(false, label, 'expected permission denied, got: ' || sqlerrm);
    when others then
      if sqlerrm = 'permission test: statement succeeded' then
        return pg_temp.record(false, label, 'expected permission denied, but it succeeded');
      end if;
      return pg_temp.record(false, label, 'expected permission denied, got: ' || sqlerrm);
  end;
end;
$$;

create function pg_temp.expect_rows(label text, stmt text, expected bigint)
returns text language plpgsql as $$
declare
  n bigint;
begin
  execute stmt;
  get diagnostics n = row_count;
  return pg_temp.record(n = expected, label, format('expected %s row(s), got %s', expected, n));
exception when others then
  return pg_temp.record(false, label, 'error: ' || sqlerrm);
end;
$$;

create function pg_temp.expect_true(label text, expr text)
returns text language plpgsql as $$
declare
  ok boolean;
begin
  execute 'select (' || expr || ')::boolean' into ok;
  return pg_temp.record(coalesce(ok, false), label, 'was ' || coalesce(ok::text, 'null'));
exception when others then
  return pg_temp.record(false, label, 'error: ' || sqlerrm);
end;
$$;

grant execute on function pg_temp.record(boolean, text, text) to public;
grant execute on function pg_temp.expect_denied(text, text) to public;
grant execute on function pg_temp.expect_rows(text, text, bigint) to public;
grant execute on function pg_temp.expect_true(text, text) to public;

-- ------------------------------------------------------------
-- Fixtures: Alice creates a group, Bob joins it, Carol is an outsider.
-- ------------------------------------------------------------

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-0000000000a1', 'perm-test-alice@example.com', '{"display_name": "Alice"}'),
  ('00000000-0000-4000-8000-0000000000b2', 'perm-test-bob@example.com',   '{"display_name": "Bob"}'),
  ('00000000-0000-4000-8000-0000000000c3', 'perm-test-carol@example.com', '{"display_name": "Carol"}');

set local role authenticated;

select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000a1", "role": "authenticated"}', true);
select set_config('test.gid', public.create_group('Permission test', 'USD')::text, true);
select set_config('test.code', (select join_code from public.groups where id = current_setting('test.gid')::uuid), true);

select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000b2", "role": "authenticated"}', true);
select public.join_group(current_setting('test.code')) is not null as bob_joined;

-- ------------------------------------------------------------
-- groups, as Bob (a member who did not create the group)
-- ------------------------------------------------------------

select pg_temp.expect_denied('groups: member cannot set created_by (group takeover)',
  $$update public.groups set created_by = auth.uid() where id = current_setting('test.gid')::uuid$$);
select pg_temp.expect_denied('groups: member cannot set join_code',
  $$update public.groups set join_code = 'ZZZZZZ' where id = current_setting('test.gid')::uuid$$);
select pg_temp.expect_denied('groups: member cannot set id',
  $$update public.groups set id = gen_random_uuid() where id = current_setting('test.gid')::uuid$$);
select pg_temp.expect_denied('groups: member cannot set created_at',
  $$update public.groups set created_at = now() where id = current_setting('test.gid')::uuid$$);
select pg_temp.expect_rows('groups: member can edit settings (name, currency, simplify debts)',
  $$update public.groups set name = 'Renamed by Bob', default_currency = 'EUR', simplify_debts = false
    where id = current_setting('test.gid')::uuid$$, 1);
select pg_temp.expect_rows('groups: non-creator delete removes nothing',
  $$delete from public.groups where id = current_setting('test.gid')::uuid$$, 0);
select pg_temp.expect_true('groups: created_by is still Alice',
  $$(select created_by from public.groups where id = current_setting('test.gid')::uuid)
    = '00000000-0000-4000-8000-0000000000a1'$$);
select pg_temp.expect_true('groups: regenerate_join_code still works (SECURITY DEFINER)',
  $$public.regenerate_join_code(current_setting('test.gid')::uuid) ~ '^[A-Z0-9]{6}$'$$);
select pg_temp.expect_true('groups: join code was actually changed',
  $$(select join_code from public.groups where id = current_setting('test.gid')::uuid) <> current_setting('test.code')$$);

-- ------------------------------------------------------------
-- expenses, as Bob: the app's paths still work
-- ------------------------------------------------------------

select set_config('test.eid', public.save_expense(
  null, current_setting('test.gid')::uuid, 'Weekly dinner', 1000, 'USD',
  '00000000-0000-4000-8000-0000000000b2', 'food', null, current_date - 10, 'equal',
  '[{"user_id": "00000000-0000-4000-8000-0000000000a1", "share_cents": 500},
    {"user_id": "00000000-0000-4000-8000-0000000000b2", "share_cents": 500}]', null, 'weekly')::text, true);

select pg_temp.expect_true('expenses: materialize_recurring makes the due copy (SECURITY DEFINER)',
  $$public.materialize_recurring(current_setting('test.gid')::uuid) = 1$$);
select pg_temp.expect_true('expenses: recurring counter advanced to 1',
  $$(select repeat_count from public.expenses where id = current_setting('test.eid')::uuid) = 1$$);

select pg_temp.expect_true('expenses: save_expense edit works (same schedule)',
  $$public.save_expense(
    current_setting('test.eid')::uuid, current_setting('test.gid')::uuid, 'Weekly dinner (edited)', 1200, 'USD',
    '00000000-0000-4000-8000-0000000000b2', 'food', 'note', current_date - 10, 'equal',
    '[{"user_id": "00000000-0000-4000-8000-0000000000a1", "share_cents": 600},
      {"user_id": "00000000-0000-4000-8000-0000000000b2", "share_cents": 600}]', null, 'weekly')
    = current_setting('test.eid')::uuid$$);
select pg_temp.expect_true('expenses: edit saved, counter kept when schedule unchanged',
  $$(select amount_cents = 1200 and description = 'Weekly dinner (edited)' and repeat_count = 1
       and repeat_anchor = current_date - 10
     from public.expenses where id = current_setting('test.eid')::uuid)$$);

select pg_temp.expect_true('expenses: save_expense edit works (schedule changed)',
  $$public.save_expense(
    current_setting('test.eid')::uuid, current_setting('test.gid')::uuid, 'Monthly dinner', 1200, 'USD',
    '00000000-0000-4000-8000-0000000000b2', 'food', null, current_date - 5, 'equal',
    '[{"user_id": "00000000-0000-4000-8000-0000000000a1", "share_cents": 600},
      {"user_id": "00000000-0000-4000-8000-0000000000b2", "share_cents": 600}]', null, 'monthly')
    = current_setting('test.eid')::uuid$$);
select pg_temp.expect_true('expenses: schedule change restarts counter and anchor',
  $$(select repeat_interval = 'monthly' and repeat_count = 0 and repeat_anchor = current_date - 5
     from public.expenses where id = current_setting('test.eid')::uuid)$$);
select pg_temp.expect_true('expenses: edit replaced the splits',
  $$(select count(*) = 2 and sum(share_cents) = 1200
     from public.expense_splits where expense_id = current_setting('test.eid')::uuid)$$);

select pg_temp.expect_rows('expenses: member can set receipt_path',
  $$update public.expenses set receipt_path = current_setting('test.gid') || '/' || current_setting('test.eid') || '/r.jpg'
    where id = current_setting('test.eid')::uuid$$, 1);
select pg_temp.expect_rows('expenses: member can edit notes directly',
  $$update public.expenses set notes = 'direct edit' where id = current_setting('test.eid')::uuid$$, 1);
select pg_temp.expect_rows('expenses: "stop repeating" works',
  $$update public.expenses set repeat_interval = 'none', repeat_anchor = null
    where id = current_setting('test.eid')::uuid and group_id = current_setting('test.gid')::uuid$$, 1);
select pg_temp.expect_true('expenses: stopped expense has no schedule',
  $$(select repeat_interval = 'none' and repeat_anchor is null
     from public.expenses where id = current_setting('test.eid')::uuid)$$);
select pg_temp.expect_rows('expenses: direct date change on a recurring expense',
  $$update public.expenses set repeat_interval = 'weekly', expense_date = current_date - 3
    where id = current_setting('test.eid')::uuid$$, 1);
select pg_temp.expect_true('expenses: direct date change re-anchors the schedule (no duplicate copies)',
  $$(select repeat_count = 0 and repeat_anchor = current_date - 3
     from public.expenses where id = current_setting('test.eid')::uuid)$$);

-- ------------------------------------------------------------
-- expenses, as Bob: protected columns
-- ------------------------------------------------------------

select pg_temp.expect_denied('expenses: member cannot set created_by',
  $$update public.expenses set created_by = '00000000-0000-4000-8000-0000000000a1'
    where id = current_setting('test.eid')::uuid$$);
select pg_temp.expect_denied('expenses: member cannot set group_id',
  $$update public.expenses set group_id = gen_random_uuid() where id = current_setting('test.eid')::uuid$$);
select pg_temp.expect_denied('expenses: member cannot set repeat_count',
  $$update public.expenses set repeat_count = 0 where id = current_setting('test.eid')::uuid$$);
select pg_temp.expect_denied('expenses: member cannot set recurring_source_id',
  $$update public.expenses set recurring_source_id = null where id = current_setting('test.eid')::uuid$$);
select pg_temp.expect_denied('expenses: member cannot set created_at',
  $$update public.expenses set created_at = now() where id = current_setting('test.eid')::uuid$$);
select pg_temp.expect_denied('expenses: member cannot set id',
  $$update public.expenses set id = gen_random_uuid() where id = current_setting('test.eid')::uuid$$);

-- ------------------------------------------------------------
-- profiles, as Bob
-- ------------------------------------------------------------

select pg_temp.expect_rows('profiles: user can edit display_name and default_currency',
  $$update public.profiles set display_name = 'Bobby', default_currency = 'EUR' where id = auth.uid()$$, 1);
select pg_temp.expect_denied('profiles: user cannot rewrite email',
  $$update public.profiles set email = 'someone-else@example.com' where id = auth.uid()$$);
select pg_temp.expect_denied('profiles: user cannot set id',
  $$update public.profiles set id = gen_random_uuid() where id = auth.uid()$$);
select pg_temp.expect_denied('profiles: user cannot set created_at',
  $$update public.profiles set created_at = now() where id = auth.uid()$$);
select pg_temp.expect_rows('profiles: user cannot edit someone else (RLS)',
  $$update public.profiles set display_name = 'Hacked' where id = '00000000-0000-4000-8000-0000000000a1'$$, 0);

-- ------------------------------------------------------------
-- Carol, signed in but not a member
-- ------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000c3", "role": "authenticated"}', true);
select pg_temp.expect_rows('outsider: cannot rename the group (RLS)',
  $$update public.groups set name = 'Hijacked' where id = current_setting('test.gid')::uuid$$, 0);
select pg_temp.expect_rows('outsider: cannot delete the group (RLS)',
  $$delete from public.groups where id = current_setting('test.gid')::uuid$$, 0);

-- ------------------------------------------------------------
-- anon (signed out): no UPDATE privilege at all
-- ------------------------------------------------------------

reset role;
set local role anon;
select set_config('request.jwt.claims', '', true);
select pg_temp.expect_denied('anon: cannot update groups',
  $$update public.groups set name = 'x' where id = current_setting('test.gid')::uuid$$);
select pg_temp.expect_denied('anon: cannot update expenses',
  $$update public.expenses set description = 'x' where id = current_setting('test.eid')::uuid$$);
select pg_temp.expect_denied('anon: cannot update profiles',
  $$update public.profiles set display_name = 'x'$$);

-- ------------------------------------------------------------
-- Alice, the creator, can still delete her group
-- ------------------------------------------------------------

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000a1", "role": "authenticated"}', true);
select pg_temp.expect_rows('groups: creator can delete the group',
  $$delete from public.groups where id = current_setting('test.gid')::uuid$$, 1);

-- ------------------------------------------------------------
-- Summary
-- ------------------------------------------------------------

reset role;
do $$
declare
  checks int := current_setting('test.checks')::int;
  failures int := current_setting('test.failures')::int;
begin
  raise notice 'SUMMARY  % checks, % passed, % failed', checks, checks - failures, failures;
  if failures > 0 then
    raise exception '% of % permission checks failed', failures, checks;
  end if;
end;
$$;

rollback;
