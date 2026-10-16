-- Splitwise clone schema
-- Run this whole file in the Supabase SQL Editor. It is safe to re-run, and re-running it
-- upgrades an existing database in place (existing groups and expenses are kept).
--
-- Money is stored as integers in the currency's minor unit (cents for USD, yen for JPY).
-- Columns are named *_cents for simplicity.

-- ============================================================
-- Tables
-- ============================================================

create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text not null,
  display_name text not null,
  created_at   timestamptz not null default now()
);
alter table public.profiles
  add column if not exists default_currency text not null default 'USD'
    check (default_currency ~ '^[A-Z]{3}$');

create table if not exists public.groups (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(trim(name)) between 1 and 80),
  join_code  text not null unique check (join_code ~ '^[A-Z0-9]{6}$'),
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.groups
  add column if not exists default_currency text not null default 'USD'
    check (default_currency ~ '^[A-Z]{3}$'),
  add column if not exists simplify_debts boolean not null default true;

create table if not exists public.group_members (
  group_id  uuid not null references public.groups (id) on delete cascade,
  user_id   uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index if not exists group_members_user_id_idx on public.group_members (user_id);

create table if not exists public.expenses (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references public.groups (id) on delete cascade,
  description  text not null check (char_length(trim(description)) between 1 and 120),
  amount_cents integer not null check (amount_cents > 0),
  paid_by      uuid not null references public.profiles (id) on delete cascade,
  created_by   uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at   timestamptz not null default now()
);
alter table public.expenses
  add column if not exists currency text not null default 'USD'
    check (currency ~ '^[A-Z]{3}$'),
  add column if not exists category text not null default 'general'
    check (category in ('general', 'food', 'groceries', 'transport', 'housing', 'utilities',
                        'entertainment', 'travel', 'shopping', 'health', 'gifts', 'other')),
  add column if not exists notes text check (char_length(notes) <= 1000),
  add column if not exists expense_date date not null default current_date,
  add column if not exists split_type text not null default 'equal',
  add column if not exists updated_at timestamptz not null default now(),
  -- Raw split inputs (percentages, shares, or itemized bill) so edits reopen exactly as entered.
  add column if not exists split_details jsonb,
  add column if not exists receipt_path text check (char_length(receipt_path) <= 300),
  -- Recurring: the original expense is the template; copies are created as dates come due.
  add column if not exists repeat_interval text not null default 'none',
  add column if not exists repeat_anchor date,
  add column if not exists repeat_count integer not null default 0,
  add column if not exists recurring_source_id uuid references public.expenses (id) on delete set null;
alter table public.expenses drop constraint if exists expenses_split_type_check;
alter table public.expenses add constraint expenses_split_type_check
  check (split_type in ('equal', 'exact', 'percent', 'shares', 'itemized'));
alter table public.expenses drop constraint if exists expenses_repeat_interval_check;
alter table public.expenses add constraint expenses_repeat_interval_check
  check (repeat_interval in ('none', 'weekly', 'biweekly', 'monthly', 'yearly'));
create index if not exists expenses_group_created_idx on public.expenses (group_id, created_at desc);
-- Lets expense_splits reference (expense id, group id) together, so a split can't point
-- at a different group than its expense.
create unique index if not exists expenses_id_group_idx on public.expenses (id, group_id);

-- Who owes what for each expense. Shares always add up to the expense amount.
create table if not exists public.expense_splits (
  expense_id  uuid not null,
  group_id    uuid not null,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  share_cents integer not null check (share_cents >= 0),
  primary key (expense_id, user_id),
  foreign key (expense_id, group_id) references public.expenses (id, group_id) on delete cascade
);
create index if not exists expense_splits_group_idx on public.expense_splits (group_id);
create index if not exists expense_splits_user_idx on public.expense_splits (user_id);

-- Recorded settle-up payments: from_user paid to_user.
create table if not exists public.payments (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references public.groups (id) on delete cascade,
  from_user    uuid not null references public.profiles (id) on delete cascade,
  to_user      uuid not null references public.profiles (id) on delete cascade,
  amount_cents integer not null check (amount_cents > 0),
  currency     text not null check (currency ~ '^[A-Z]{3}$'),
  note         text check (char_length(note) <= 200),
  paid_on      date not null default current_date,
  created_by   uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at   timestamptz not null default now(),
  check (from_user <> to_user)
);
create index if not exists payments_group_idx on public.payments (group_id, created_at desc);

-- Per-group history. Written only by triggers, so it can't be forged.
create table if not exists public.activity (
  id         bigint generated always as identity primary key,
  group_id   uuid not null references public.groups (id) on delete cascade,
  actor_id   uuid references public.profiles (id) on delete set null,
  kind       text not null,
  details    jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists activity_group_idx on public.activity (group_id, created_at desc);

create table if not exists public.expense_comments (
  id         uuid primary key default gen_random_uuid(),
  expense_id uuid not null,
  group_id   uuid not null,
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body       text not null check (char_length(trim(body)) between 1 and 1000),
  created_at timestamptz not null default now(),
  foreign key (expense_id, group_id) references public.expenses (id, group_id) on delete cascade
);
create index if not exists expense_comments_expense_idx on public.expense_comments (expense_id, created_at);

-- ============================================================
-- Profile row on signup
-- ============================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      split_part(new.email, '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- SECURITY DEFINER helpers (bypass RLS, so policies on
-- group_members can use them without infinite recursion)
-- ============================================================

create or replace function public.is_group_member(gid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.group_members
    where group_id = gid and user_id = auth.uid()
  );
$$;

create or replace function public.is_user_in_group(gid uuid, uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.group_members
    where group_id = gid and user_id = uid
  );
$$;

create or replace function public.shares_group_with(other uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.group_members mine
    join public.group_members theirs on theirs.group_id = mine.group_id
    where mine.user_id = auth.uid() and theirs.user_id = other
  );
$$;

-- True when uid's balance in the group is exactly zero in every currency.
create or replace function public.is_settled_in_group(gid uuid, uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(bool_and(total = 0), true)
  from (
    select currency, sum(v) as total
    from (
      select currency, amount_cents as v from public.expenses
        where group_id = gid and paid_by = uid
      union all
      select e.currency, -s.share_cents from public.expense_splits s
        join public.expenses e on e.id = s.expense_id
        where s.group_id = gid and s.user_id = uid
      union all
      select currency, amount_cents from public.payments
        where group_id = gid and from_user = uid
      union all
      select currency, -amount_cents from public.payments
        where group_id = gid and to_user = uid
    ) parts
    group by currency
  ) totals;
$$;

create or replace function public.new_join_code()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- no 0/O/1/I
  code text;
begin
  loop
    code := '';
    for i in 1..6 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.groups where join_code = code);
  end loop;
  return code;
end;
$$;

-- ============================================================
-- Group RPCs
-- ============================================================

-- Create a group with a unique 6-character join code and add the caller as a member.
drop function if exists public.create_group(text);
create or replace function public.create_group(group_name text, group_currency text default 'USD')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if group_name is null or char_length(trim(group_name)) = 0 then
    raise exception 'Group name is required';
  end if;

  insert into public.groups (name, join_code, created_by, default_currency)
  values (trim(group_name), public.new_join_code(), auth.uid(), coalesce(group_currency, 'USD'))
  returning id into new_id;

  insert into public.group_members (group_id, user_id)
  values (new_id, auth.uid());

  return new_id;
end;
$$;

-- Join a group by code. Non-members can't SELECT groups, so this looks it up for them.
create or replace function public.join_group(code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  gid uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select id into gid from public.groups where join_code = upper(trim(code));
  if gid is null then
    raise exception 'No group found with that code';
  end if;

  insert into public.group_members (group_id, user_id)
  values (gid, auth.uid())
  on conflict do nothing;

  return gid;
end;
$$;

create or replace function public.regenerate_join_code(gid uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  code text;
begin
  if not public.is_group_member(gid) then
    raise exception 'You are not a member of this group';
  end if;
  code := public.new_join_code();
  update public.groups set join_code = code where id = gid;
  return code;
end;
$$;

-- Leave a group. You must be settled up first. The last member out deletes the group.
create or replace function public.leave_group(gid uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_group_member(gid) then
    raise exception 'You are not a member of this group';
  end if;
  if not public.is_settled_in_group(gid, auth.uid()) then
    raise exception 'Settle up your balance before leaving the group';
  end if;

  delete from public.group_members where group_id = gid and user_id = auth.uid();
  if not exists (select 1 from public.group_members where group_id = gid) then
    delete from public.groups where id = gid;
  end if;
end;
$$;

-- Remove another member. They must be settled up first.
create or replace function public.remove_member(gid uuid, uid uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_group_member(gid) then
    raise exception 'You are not a member of this group';
  end if;
  if uid = auth.uid() then
    raise exception 'Use "Leave group" to remove yourself';
  end if;
  if not public.is_user_in_group(gid, uid) then
    raise exception 'That person is not in this group';
  end if;
  if not public.is_settled_in_group(gid, uid) then
    raise exception 'That member must be settled up before they can be removed';
  end if;

  delete from public.group_members where group_id = gid and user_id = uid;
end;
$$;

-- ============================================================
-- Expense RPC: create or update an expense and its splits in one transaction.
-- SECURITY INVOKER, so row level security still applies to every write.
-- ============================================================

drop function if exists public.save_expense(uuid, uuid, text, integer, text, uuid, text, text, date, text, jsonb);
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
      repeat_count = case
        when repeat_interval is distinct from p_repeat_interval or expense_date is distinct from p_expense_date
          then 0 else repeat_count end,
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

-- Create any recurring copies that have come due (up to today) for a group.
-- Called whenever a member opens the group or dashboard, so no cron job or secret key is needed.
-- Row locks on the templates stop two simultaneous visitors from creating duplicates.
create or replace function public.materialize_recurring(gid uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  t record;
  step interval;
  next_date date;
  made integer := 0;
  new_id uuid;
begin
  if not public.is_group_member(gid) then
    return 0;
  end if;

  for t in
    select * from public.expenses
    where group_id = gid and repeat_interval <> 'none' and repeat_anchor is not null
    for update
  loop
    step := case t.repeat_interval
      when 'weekly' then interval '1 week'
      when 'biweekly' then interval '2 weeks'
      when 'monthly' then interval '1 month'
      else interval '1 year' end;
    loop
      -- Always count from the anchor so month-end dates don't drift (Jan 31 -> Feb 28 -> Mar 31).
      next_date := (t.repeat_anchor + step * (t.repeat_count + 1))::date;
      exit when next_date > current_date or made >= 200;

      insert into public.expenses
        (group_id, description, amount_cents, currency, paid_by, category, notes, expense_date,
         split_type, split_details, created_by, recurring_source_id)
      values
        (t.group_id, t.description, t.amount_cents, t.currency, t.paid_by, t.category, t.notes, next_date,
         t.split_type, t.split_details, t.created_by, t.id)
      returning id into new_id;

      insert into public.expense_splits (expense_id, group_id, user_id, share_cents)
      select new_id, t.group_id, user_id, share_cents
      from public.expense_splits where expense_id = t.id;

      t.repeat_count := t.repeat_count + 1;
      update public.expenses set repeat_count = t.repeat_count where id = t.id;
      made := made + 1;
    end loop;
  end loop;
  return made;
end;
$$;

-- ============================================================
-- Activity log triggers
-- ============================================================

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

drop trigger if exists log_expense_activity on public.expenses;
create trigger log_expense_activity
  after insert or update or delete on public.expenses
  for each row execute function public.log_activity();

drop trigger if exists log_payment_activity on public.payments;
create trigger log_payment_activity
  after insert or delete on public.payments
  for each row execute function public.log_activity();

drop trigger if exists log_member_activity on public.group_members;
create trigger log_member_activity
  after insert or delete on public.group_members
  for each row execute function public.log_activity();

drop trigger if exists log_comment_activity on public.expense_comments;
create trigger log_comment_activity
  after insert or delete on public.expense_comments
  for each row execute function public.log_activity();

drop trigger if exists log_group_activity on public.groups;
create trigger log_group_activity
  after update on public.groups
  for each row execute function public.log_activity();

-- ============================================================
-- Function permissions: signed-in users only
-- ============================================================

revoke execute on function public.is_group_member(uuid)                from public, anon;
revoke execute on function public.is_user_in_group(uuid, uuid)         from public, anon;
revoke execute on function public.shares_group_with(uuid)              from public, anon;
revoke execute on function public.is_settled_in_group(uuid, uuid)      from public, anon;
revoke execute on function public.new_join_code()                      from public, anon, authenticated;
revoke execute on function public.create_group(text, text)             from public, anon;
revoke execute on function public.join_group(text)                     from public, anon;
revoke execute on function public.regenerate_join_code(uuid)           from public, anon;
revoke execute on function public.leave_group(uuid)                    from public, anon;
revoke execute on function public.remove_member(uuid, uuid)            from public, anon;
revoke execute on function public.save_expense(uuid, uuid, text, integer, text, uuid, text, text, date, text, jsonb, jsonb, text) from public, anon;
revoke execute on function public.materialize_recurring(uuid)          from public, anon;
revoke execute on function public.log_activity()                       from public, anon, authenticated;
grant  execute on function public.is_group_member(uuid)                to authenticated;
grant  execute on function public.is_user_in_group(uuid, uuid)         to authenticated;
grant  execute on function public.shares_group_with(uuid)              to authenticated;
grant  execute on function public.is_settled_in_group(uuid, uuid)      to authenticated;
grant  execute on function public.create_group(text, text)             to authenticated;
grant  execute on function public.join_group(text)                     to authenticated;
grant  execute on function public.regenerate_join_code(uuid)           to authenticated;
grant  execute on function public.leave_group(uuid)                    to authenticated;
grant  execute on function public.remove_member(uuid, uuid)            to authenticated;
grant  execute on function public.save_expense(uuid, uuid, text, integer, text, uuid, text, text, date, text, jsonb, jsonb, text) to authenticated;
grant  execute on function public.materialize_recurring(uuid)          to authenticated;

-- ============================================================
-- Row level security
-- ============================================================

alter table public.profiles       enable row level security;
alter table public.groups         enable row level security;
alter table public.group_members  enable row level security;
alter table public.expenses       enable row level security;
alter table public.expense_splits enable row level security;
alter table public.payments       enable row level security;
alter table public.activity       enable row level security;
alter table public.expense_comments enable row level security;

-- profiles: see yourself and anyone you share a group with; edit only yourself.
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.shares_group_with(id));

drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- groups: members can see and edit settings; only the creator can delete.
-- Creation goes through create_group().
drop policy if exists "groups_select_member" on public.groups;
create policy "groups_select_member" on public.groups
  for select to authenticated
  using (public.is_group_member(id));

drop policy if exists "groups_update_member" on public.groups;
create policy "groups_update_member" on public.groups
  for update to authenticated
  using (public.is_group_member(id))
  with check (public.is_group_member(id));

drop policy if exists "groups_delete_creator" on public.groups;
create policy "groups_delete_creator" on public.groups
  for delete to authenticated
  using (created_by = auth.uid() and public.is_group_member(id));

-- group_members: see the member list of your own groups.
-- Joining, leaving, and removing go through RPCs.
drop policy if exists "group_members_select" on public.group_members;
create policy "group_members_select" on public.group_members
  for select to authenticated
  using (public.is_group_member(group_id));

-- expenses: members can see, add, edit, and delete expenses in their groups.
-- The payer must also be a member of the group.
drop policy if exists "expenses_select_member" on public.expenses;
create policy "expenses_select_member" on public.expenses
  for select to authenticated
  using (public.is_group_member(group_id));

drop policy if exists "expenses_insert_member" on public.expenses;
create policy "expenses_insert_member" on public.expenses
  for insert to authenticated
  with check (
    public.is_group_member(group_id)
    and created_by = auth.uid()
    and public.is_user_in_group(group_id, paid_by)
  );

drop policy if exists "expenses_update_member" on public.expenses;
create policy "expenses_update_member" on public.expenses
  for update to authenticated
  using (public.is_group_member(group_id))
  with check (
    public.is_group_member(group_id)
    and public.is_user_in_group(group_id, paid_by)
  );

drop policy if exists "expenses_delete_member" on public.expenses;
create policy "expenses_delete_member" on public.expenses
  for delete to authenticated
  using (public.is_group_member(group_id));

-- expense_splits: members can manage splits; everyone in a split must be a member.
drop policy if exists "expense_splits_select" on public.expense_splits;
create policy "expense_splits_select" on public.expense_splits
  for select to authenticated
  using (public.is_group_member(group_id));

drop policy if exists "expense_splits_insert" on public.expense_splits;
create policy "expense_splits_insert" on public.expense_splits
  for insert to authenticated
  with check (public.is_group_member(group_id) and public.is_user_in_group(group_id, user_id));

drop policy if exists "expense_splits_delete" on public.expense_splits;
create policy "expense_splits_delete" on public.expense_splits
  for delete to authenticated
  using (public.is_group_member(group_id));

-- payments: members can see, record, and delete payments between members.
drop policy if exists "payments_select" on public.payments;
create policy "payments_select" on public.payments
  for select to authenticated
  using (public.is_group_member(group_id));

drop policy if exists "payments_insert" on public.payments;
create policy "payments_insert" on public.payments
  for insert to authenticated
  with check (
    public.is_group_member(group_id)
    and created_by = auth.uid()
    and public.is_user_in_group(group_id, from_user)
    and public.is_user_in_group(group_id, to_user)
  );

drop policy if exists "payments_delete" on public.payments;
create policy "payments_delete" on public.payments
  for delete to authenticated
  using (public.is_group_member(group_id));

-- activity: read-only for members.
drop policy if exists "activity_select" on public.activity;
create policy "activity_select" on public.activity
  for select to authenticated
  using (public.is_group_member(group_id));

-- expense_comments: members read; you write and delete only your own.
drop policy if exists "expense_comments_select" on public.expense_comments;
create policy "expense_comments_select" on public.expense_comments
  for select to authenticated
  using (public.is_group_member(group_id));

drop policy if exists "expense_comments_insert" on public.expense_comments;
create policy "expense_comments_insert" on public.expense_comments
  for insert to authenticated
  with check (public.is_group_member(group_id) and user_id = auth.uid());

drop policy if exists "expense_comments_delete" on public.expense_comments;
create policy "expense_comments_delete" on public.expense_comments
  for delete to authenticated
  using (user_id = auth.uid() and public.is_group_member(group_id));

-- ============================================================
-- Receipt photos: private Storage bucket. Files live at <group_id>/<expense_id>/<file>,
-- and only members of that group can read, upload, or delete them.
-- ============================================================

-- First path segment as a group id, or null if it isn't a uuid.
create or replace function public.receipt_group_id(object_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case when split_part(object_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then split_part(object_name, '/', 1)::uuid end;
$$;

-- Guarded: if this project doesn't let the SQL Editor manage Storage, everything else in this
-- file still applies, and a warning explains what was skipped.
do $outer$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('receipts', 'receipts', false, 5242880,
          array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'])
  on conflict (id) do update set
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
  execute $sql$drop policy if exists "receipts_select_member" on storage.objects;$sql$;
  execute $sql$create policy "receipts_select_member" on storage.objects
  for select to authenticated
  using (bucket_id = 'receipts' and public.is_group_member(public.receipt_group_id(name)));$sql$;
  execute $sql$drop policy if exists "receipts_insert_member" on storage.objects;$sql$;
  execute $sql$create policy "receipts_insert_member" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'receipts' and public.is_group_member(public.receipt_group_id(name)));$sql$;
  execute $sql$drop policy if exists "receipts_delete_member" on storage.objects;$sql$;
  execute $sql$create policy "receipts_delete_member" on storage.objects
  for delete to authenticated
  using (bucket_id = 'receipts' and public.is_group_member(public.receipt_group_id(name)));$sql$;
exception when others then
  raise warning 'Receipt storage setup skipped: %', sqlerrm;
end;
$outer$;

-- ============================================================
-- Live updates: stream changes to these tables over Supabase Realtime
-- (row level security still decides who receives each change).
-- ============================================================

do $$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['expenses', 'expense_splits', 'payments', 'group_members', 'expense_comments', 'groups'] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
exception when others then
  raise warning 'Realtime setup skipped: %', sqlerrm;
end;
$$;

-- ============================================================
-- Upgrade existing data: give expenses created before splits existed an
-- equal split across the group's current members (leftover cents go to the
-- earliest members). Only touches expenses that have no splits yet.
-- ============================================================

insert into public.expense_splits (expense_id, group_id, user_id, share_cents)
select e.id, e.group_id, m.user_id,
       e.amount_cents / m.n + case when m.idx < e.amount_cents % m.n then 1 else 0 end
from public.expenses e
join (
  select group_id, user_id,
         row_number() over (partition by group_id order by joined_at, user_id) - 1 as idx,
         count(*) over (partition by group_id) as n
  from public.group_members
) m on m.group_id = e.group_id
where not exists (select 1 from public.expense_splits s where s.expense_id = e.id);
