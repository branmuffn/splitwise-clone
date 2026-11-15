-- Name-only accounts, part 2 (2026-11-15): invite links, adding an email later, and test-account cleanup.
-- Part 1 (handle_new_user with '' email and the 'Friend' fallback) is in schema.sql.
--
-- Run once in Supabase: SQL Editor -> New query -> paste this file -> Run. Safe to re-run.

-- 1) Invite link preview. /join/<code> shows the group's name and member count before you join.
--    Anyone holding the code can already join, so showing its name is no extra exposure.
create or replace function public.group_invite_preview(code text)
returns table (name text, members integer)
language sql
stable
security definer
set search_path = ''
as $$
  select g.name, (select count(*)::integer from public.group_members m where m.group_id = g.id)
  from public.groups g
  where g.join_code = upper(trim(code));
$$;

revoke execute on function public.group_invite_preview(text) from public;
grant execute on function public.group_invite_preview(text) to anon, authenticated;

-- 2) When a name-only account adds an email (Profile -> Add an email), copy it to its profile,
--    so friends' Remind buttons and the app's "no email yet" reminders stay right.
create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set email = coalesce(new.email, '') where id = new.id;
  return new;
end;
$$;

revoke execute on function public.handle_user_email_change() from public, anon, authenticated;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function public.handle_user_email_change();

-- 3) The daily cleanup (scheduled by 20261114120000_demo_cleanup.sql) now also removes automated test accounts:
--    demo accounts after 30 days (as before), plus Claude's test accounts after 1 day: email ones
--    (claude-e2e-...@example.com) and name-only ones whose name starts with "E2E ".
--    Deleting a user removes their profile, groups, expenses, payments and comments (all "on delete cascade").
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
         and exists (select 1 from public.profiles p where p.id = u.id and p.display_name like 'E2E %'));
  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke execute on function public.cleanup_old_demo_accounts() from public, anon, authenticated;

-- Check: select public.group_invite_preview('ABC123');  -- no rows for a made-up code
