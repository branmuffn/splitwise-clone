-- Column-level UPDATE grants (security fix S1, 2026-11-12)
--
-- The problem: Supabase gives the `authenticated` role UPDATE on every column of every table, and
-- the RLS update policies only check group membership. So any group member could PATCH
-- groups.created_by to themselves over the REST API and then delete the whole group (the
-- groups_delete_creator policy trusts created_by), or set groups.join_code to anything. Members
-- could also rewrite expenses.created_by / group_id / repeat_count, and anyone could rewrite their
-- own profiles.email, which co-members see.
--
-- The fix: take away table-wide UPDATE and grant it back only on the columns the app edits.
--   * SECURITY DEFINER functions (regenerate_join_code, materialize_recurring, create_group, ...)
--     run as the table owner, so they are not affected.
--   * save_expense is SECURITY INVOKER, so every column it writes on edit must be granted. It
--     used to write repeat_count too; that reset now happens in a trigger (below), so members
--     never need UPDATE on repeat_count.
--   * A column added later is NOT editable by signed-in users until it is added to a grant here
--     (and in supabase/schema.sql). That is on purpose.
--
-- Safe to re-run: REVOKE on a table also removes its column grants, and the GRANTs repeat cleanly.
-- The same change is mirrored in supabase/schema.sql, so re-running that file gives the same result.

-- ------------------------------------------------------------
-- 1. Restart the recurring counter in a trigger instead of inside save_expense.
--    Same rule as before: changing the schedule or the date restarts it from the expense's date.
--    BEFORE triggers can change NEW without the caller holding UPDATE on those columns.
-- ------------------------------------------------------------

create or replace function public.reset_repeat_count()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.repeat_interval is distinct from old.repeat_interval
     or new.expense_date is distinct from old.expense_date then
    new.repeat_count := 0;
    new.repeat_anchor := case when new.repeat_interval = 'none' then null else new.expense_date end;
  end if;
  return new;
end;
$$;

revoke execute on function public.reset_repeat_count() from public, anon, authenticated;

drop trigger if exists reset_repeat_count on public.expenses;
create trigger reset_repeat_count
  before update of repeat_interval, expense_date on public.expenses
  for each row execute function public.reset_repeat_count();

-- ------------------------------------------------------------
-- 2. save_expense without the repeat_count assignment (otherwise identical).
--    CREATE OR REPLACE keeps the existing EXECUTE grants.
-- ------------------------------------------------------------

create or replace function public.save_expense(
  p_expense_id   uuid,
  p_group_id     uuid,
  p_description  text,
  p_amount_cents integer,
  p_currency     text,
  p_paid_by      uuid,
  p_category     text,
  p_notes        text,
  p_expense_date date,
  p_split_type   text,
  p_splits       jsonb,
  p_split_details   jsonb default null,
  p_repeat_interval text default 'none'
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  eid uuid := p_expense_id;
  split_total bigint;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if jsonb_typeof(p_splits) <> 'array' or jsonb_array_length(p_splits) = 0 then
    raise exception 'Choose at least one person to split with';
  end if;

  select coalesce(sum((s ->> 'share_cents')::bigint), 0) into split_total
  from jsonb_array_elements(p_splits) s;
  if split_total <> p_amount_cents then
    raise exception 'Split shares (%) must add up to the total (%)', split_total, p_amount_cents;
  end if;

  if eid is null then
    insert into public.expenses
      (group_id, description, amount_cents, currency, paid_by, category, notes, expense_date, split_type,
       split_details, repeat_interval, repeat_anchor, repeat_count)
    values
      (p_group_id, trim(p_description), p_amount_cents, p_currency, p_paid_by,
       coalesce(p_category, 'general'), nullif(trim(p_notes), ''),
       coalesce(p_expense_date, current_date), p_split_type,
       p_split_details, coalesce(p_repeat_interval, 'none'),
       case when coalesce(p_repeat_interval, 'none') <> 'none' then coalesce(p_expense_date, current_date) end, 0)
    returning id into eid;
  else
    -- repeat_count is reset by the reset_repeat_count trigger when the schedule or date changes.
    update public.expenses set
      description  = trim(p_description),
      amount_cents = p_amount_cents,
      currency     = p_currency,
      paid_by      = p_paid_by,
      category     = coalesce(p_category, 'general'),
      notes        = nullif(trim(p_notes), ''),
      expense_date = coalesce(p_expense_date, current_date),
      split_type   = p_split_type,
      split_details = p_split_details,
      -- Changing the schedule (or the date) restarts it from this expense's date.
      repeat_anchor = case
        when coalesce(p_repeat_interval, 'none') = 'none' then null
        when repeat_interval is distinct from p_repeat_interval or expense_date is distinct from p_expense_date
          then coalesce(p_expense_date, current_date)
        else repeat_anchor end,
      repeat_interval = coalesce(p_repeat_interval, 'none'),
      updated_at   = now()
    where id = eid and group_id = p_group_id;
    if not found then
      raise exception 'Expense not found';
    end if;
    delete from public.expense_splits where expense_id = eid;
  end if;

  insert into public.expense_splits (expense_id, group_id, user_id, share_cents)
  select eid, p_group_id, (s ->> 'user_id')::uuid, (s ->> 'share_cents')::integer
  from jsonb_array_elements(p_splits) s;

  return eid;
end;
$$;

-- ------------------------------------------------------------
-- 3. Column-level UPDATE grants. Not granted on purpose:
--    groups:   id, join_code (only via regenerate_join_code), created_by, created_at
--    expenses: id, group_id, created_by, created_at, repeat_count, recurring_source_id
--    profiles: id, email, created_at
--    anon gets no UPDATE at all (it has no RLS policies anyway).
-- ------------------------------------------------------------

revoke update on public.groups from public, anon, authenticated;
grant update (name, default_currency, simplify_debts) on public.groups to authenticated;

revoke update on public.expenses from public, anon, authenticated;
grant update (description, amount_cents, currency, paid_by, category, notes, expense_date,
              split_type, split_details, repeat_interval, repeat_anchor, updated_at, receipt_path)
  on public.expenses to authenticated;

revoke update on public.profiles from public, anon, authenticated;
grant update (display_name, default_currency) on public.profiles to authenticated;
