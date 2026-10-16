-- Splitwise clone schema
-- Run this whole file in the Supabase SQL Editor. It is safe to re-run.
-- Amounts are stored in integer cents (USD only).

-- ============================================================
-- Tables
-- ============================================================

create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text not null,
  display_name text not null,
  created_at   timestamptz not null default now()
);

create table if not exists public.groups (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(trim(name)) between 1 and 80),
  join_code  text not null unique check (join_code ~ '^[A-Z0-9]{6}$'),
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

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

create index if not exists expenses_group_created_idx on public.expenses (group_id, created_at desc);

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

-- Create a group with a unique 6-character join code and add the caller as a member.
create or replace function public.create_group(group_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- no 0/O/1/I
  code text;
  new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if group_name is null or char_length(trim(group_name)) = 0 then
    raise exception 'Group name is required';
  end if;

  loop
    code := '';
    for i in 1..6 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.groups where join_code = code);
  end loop;

  insert into public.groups (name, join_code, created_by)
  values (trim(group_name), code, auth.uid())
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

revoke execute on function public.is_group_member(uuid)         from public, anon;
revoke execute on function public.is_user_in_group(uuid, uuid)  from public, anon;
revoke execute on function public.shares_group_with(uuid)       from public, anon;
revoke execute on function public.create_group(text)            from public, anon;
revoke execute on function public.join_group(text)              from public, anon;
grant  execute on function public.is_group_member(uuid)         to authenticated;
grant  execute on function public.is_user_in_group(uuid, uuid)  to authenticated;
grant  execute on function public.shares_group_with(uuid)       to authenticated;
grant  execute on function public.create_group(text)            to authenticated;
grant  execute on function public.join_group(text)              to authenticated;

-- ============================================================
-- Row level security
-- ============================================================

alter table public.profiles      enable row level security;
alter table public.groups        enable row level security;
alter table public.group_members enable row level security;
alter table public.expenses      enable row level security;

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

-- groups: members can see and rename. Creation goes through create_group().
drop policy if exists "groups_select_member" on public.groups;
create policy "groups_select_member" on public.groups
  for select to authenticated
  using (public.is_group_member(id));

drop policy if exists "groups_update_member" on public.groups;
create policy "groups_update_member" on public.groups
  for update to authenticated
  using (public.is_group_member(id))
  with check (public.is_group_member(id));

-- group_members: see the member list of your own groups. Joining goes through join_group().
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
