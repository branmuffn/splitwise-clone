-- Name-only accounts that never join or create a group delete themselves after 30 days (Brian, 2026-11-15).
-- Same nightly job as before (4am UTC); it now also removes "Start now" accounts that are in no group 30 days after they
-- were made. Anyone in a group, every email account, and stand-ins in a group are never touched.
--
-- Run once in Supabase: SQL Editor -> New query -> paste this file -> Run. Safe to re-run.

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
         and not exists (select 1 from public.group_members m where m.user_id = u.id))
     -- Name-only accounts ("Start now") that are in no group 30 days after they started (Brian, 2026-11-15).
     or (u.is_anonymous and u.created_at < now() - interval '30 days'
         and not exists (select 1 from public.group_members m where m.user_id = u.id));
  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke execute on function public.cleanup_old_demo_accounts() from public, anon, authenticated;
