-- Stand-ins (Brian, 2026-11-15): add people by name before they join. Anyone in the group can add one; they show up
-- everywhere a member does (paid by, splits, balances, settle up). When the real person joins from the invite link and
-- picks their name, claim_standin moves every expense, share, payment and comment to them and removes the stand-in.
--
-- How a stand-in exists without a service key: the app signs in a fresh anonymous account on a throwaway client
-- (nobody keeps its session), then the member who asked calls add_standin to mark it and put it in the group.
--
-- Run once in Supabase: SQL Editor -> New query -> paste this file -> Run. Safe to re-run.

alter table public.profiles add column if not exists standin_group uuid;     -- set only for stand-ins: their one group
alter table public.profiles add column if not exists standin_added_by uuid;

-- The activity log learns a quiet switch (used during a merge).
create or replace function public.log_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_data jsonb := to_jsonb(coalesce(new, old));
  gid uuid := (row_data ->> case when tg_table_name = 'groups' then 'id' else 'group_id' end)::uuid;
  kind text;
  details jsonb;
begin
  -- Stand-in merges (claim_standin) move many rows at once; they write one summary entry instead.
  if current_setting('splitwise.quiet', true) = 'on' then
    return null;
  end if;
  -- Skip rows removed because their whole group is being deleted.
  if not exists (select 1 from public.groups where id = gid) then
    return null;
  end if;

  if tg_table_name = 'expenses' then
    kind := 'expense_' || case tg_op when 'INSERT' then 'added' when 'UPDATE' then 'updated' else 'deleted' end;
    details := jsonb_build_object(
      'expense_id', row_data ->> 'id',
      'description', row_data ->> 'description',
      'amount_cents', (row_data ->> 'amount_cents')::int,
      'currency', row_data ->> 'currency',
      'recurring', (row_data ->> 'recurring_source_id') is not null);
    -- Bookkeeping updates (recurring counter, receipt path) aren't worth an activity entry.
    if tg_op = 'UPDATE' and (to_jsonb(new) - 'repeat_count' - 'receipt_path' - 'updated_at')
                          = (to_jsonb(old) - 'repeat_count' - 'receipt_path' - 'updated_at') then
      return null;
    end if;
  elsif tg_table_name = 'payments' then
    kind := 'payment_' || case tg_op when 'INSERT' then 'added' else 'deleted' end;
    details := jsonb_build_object(
      'from_user', row_data ->> 'from_user',
      'to_user', row_data ->> 'to_user',
      'amount_cents', (row_data ->> 'amount_cents')::int,
      'currency', row_data ->> 'currency');
  elsif tg_table_name = 'group_members' then
    kind := case
      when tg_op = 'INSERT' then 'member_joined'
      when (row_data ->> 'user_id')::uuid = auth.uid() then 'member_left'
      else 'member_removed' end;
    details := jsonb_build_object('user_id', row_data ->> 'user_id');
  elsif tg_table_name = 'expense_comments' then
    -- Comments removed because their expense was deleted aren't separate events.
    if not exists (select 1 from public.expenses where id = (row_data ->> 'expense_id')::uuid) then
      return null;
    end if;
    kind := 'comment_' || case tg_op when 'INSERT' then 'added' else 'deleted' end;
    details := jsonb_build_object(
      'expense_id', row_data ->> 'expense_id',
      'body', left(row_data ->> 'body', 120),
      'description', (select description from public.expenses where id = (row_data ->> 'expense_id')::uuid));
  elsif tg_table_name = 'groups' then
    if new.name is not distinct from old.name then
      return null;
    end if;
    kind := 'group_renamed';
    details := jsonb_build_object('from', old.name, 'to', new.name);
  end if;

  insert into public.activity (group_id, actor_id, kind, details)
  values (gid, auth.uid(), kind, details);
  return null;
end;
$$;

-- Mark a brand-new anonymous account as a stand-in in your group.
create or replace function public.add_standin(gid uuid, sid uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_group_member(gid) then
    raise exception 'You are not a member of this group';
  end if;
  -- Only an account the app made a moment ago, that is in no group yet, can become a stand-in.
  if not exists (select 1 from auth.users u where u.id = sid and u.is_anonymous and u.created_at > now() - interval '5 minutes')
     or exists (select 1 from public.group_members m where m.user_id = sid)
     or exists (select 1 from public.profiles p where p.id = sid and p.standin_group is not null) then
    raise exception 'Could not add that person. Please try again.';
  end if;
  update public.profiles set standin_group = gid, standin_added_by = auth.uid() where id = sid;
  perform set_config('splitwise.quiet', 'on', true);
  insert into public.group_members (group_id, user_id) values (gid, sid);
  perform set_config('splitwise.quiet', 'off', true);
  insert into public.activity (group_id, actor_id, kind, details)
  values (gid, auth.uid(), 'standin_added', jsonb_build_object('user_id', sid));
end;
$$;

-- "That's me": move everything from the stand-in to you (you must already be in the group), then remove the stand-in.
create or replace function public.claim_standin(sid uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  gid uuid;
  nm text;
begin
  if me is null then
    raise exception 'Not authenticated';
  end if;
  select p.standin_group, p.display_name into gid, nm from public.profiles p where p.id = sid;
  if gid is null then
    raise exception 'That person has already joined';
  end if;
  if sid = me or exists (select 1 from public.profiles p where p.id = me and p.standin_group is not null) then
    raise exception 'Not allowed';
  end if;
  if not exists (select 1 from public.group_members m where m.group_id = gid and m.user_id = me) then
    raise exception 'Join the group first';
  end if;

  perform set_config('splitwise.quiet', 'on', true);
  -- Shares: where you and the stand-in are both on an expense, add theirs to yours; hand over the rest.
  update public.expense_splits s set share_cents = s.share_cents + d.share_cents
    from public.expense_splits d
    where d.expense_id = s.expense_id and d.user_id = sid and s.user_id = me;
  delete from public.expense_splits d
    where d.user_id = sid and exists (select 1 from public.expense_splits s where s.expense_id = d.expense_id and s.user_id = me);
  update public.expense_splits set user_id = me where user_id = sid;
  -- Split inputs (exact / percent / shares / itemized) and activity details mention people by id.
  update public.expenses set split_details = replace(split_details::text, sid::text, me::text)::jsonb
    where group_id = gid and split_details::text like '%' || sid::text || '%';
  update public.expenses set paid_by = me where paid_by = sid;
  update public.expenses set created_by = me where created_by = sid;
  -- Payments between you and your stand-in cancel out.
  delete from public.payments where (from_user = sid and to_user = me) or (from_user = me and to_user = sid);
  update public.payments set from_user = me where from_user = sid;
  update public.payments set to_user = me where to_user = sid;
  update public.payments set created_by = me where created_by = sid;
  update public.expense_comments set user_id = me where user_id = sid;
  update public.activity set actor_id = me where actor_id = sid;
  update public.activity set details = replace(details::text, sid::text, me::text)::jsonb
    where group_id = gid and details::text like '%' || sid::text || '%';
  delete from public.group_members where group_id = gid and user_id = sid;
  perform set_config('splitwise.quiet', 'off', true);

  insert into public.activity (group_id, actor_id, kind, details)
  values (gid, me, 'standin_claimed', jsonb_build_object('name', nm));
  delete from auth.users where id = sid;
  return gid;
end;
$$;

-- The invite page lists a group's stand-ins ("Which one are you?"). Anyone with the join code can see them, the same
-- people who can join anyway.
create or replace function public.group_standins(code text)
returns table (id uuid, name text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.display_name
  from public.groups g
  join public.group_members m on m.group_id = g.id
  join public.profiles p on p.id = m.user_id
  where g.join_code = upper(trim(code)) and p.standin_group = g.id
  order by m.joined_at;
$$;

revoke execute on function public.add_standin(uuid, uuid) from public, anon;
revoke execute on function public.claim_standin(uuid) from public, anon;
revoke execute on function public.group_standins(text) from public;
grant execute on function public.add_standin(uuid, uuid) to authenticated;
grant execute on function public.claim_standin(uuid) to authenticated;
grant execute on function public.group_standins(text) to anon, authenticated;

-- Nightly cleanup: also remove stand-ins that are in no group any more (removed, or their group was deleted).
create or replace function public.cleanup_old_demo_accounts()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed integer;
begin
  delete from auth.users u
  where (u.email like 'demo-%@example.com' and u.created_at < now() - interval '30 days')
     or (u.email like 'claude-e2e-%@example.com' and u.created_at < now() - interval '1 day')
     or (u.is_anonymous and u.created_at < now() - interval '1 day'
         and exists (select 1 from public.profiles p where p.id = u.id and p.display_name like 'E2E %'))
     or (u.is_anonymous and u.created_at < now() - interval '1 day'
         and exists (select 1 from public.profiles p where p.id = u.id and p.standin_group is not null)
         and not exists (select 1 from public.group_members m where m.user_id = u.id));
  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke execute on function public.cleanup_old_demo_accounts() from public, anon, authenticated;
