-- Automatic cleanup of one-click demo accounts (2026-11-14)
--
-- Every "Try the demo" click creates three throwaway users (demo-...@example.com and two
-- demo-friend-...@example.com). This deletes the ones older than 30 days, once a day at 4am UTC.
-- Deleting a user removes their profile, and with it their groups, expenses, payments and comments
-- (all "on delete cascade"). Real accounts are never touched: only @example.com addresses that start
-- with "demo-" match, and nobody can sign up with a real inbox at example.com.
--
-- Run once in Supabase: SQL Editor -> New query -> paste this file -> Run. Safe to re-run.

create extension if not exists pg_cron;

create or replace function public.cleanup_old_demo_accounts()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed integer;
begin
  delete from auth.users
  where email like 'demo-%@example.com'
    and created_at < now() - interval '30 days';
  get diagnostics removed = row_count;
  return removed;
end;
$$;

-- Only the scheduler (and you, in the SQL Editor) may run it; signed-in users and visitors can't.
revoke execute on function public.cleanup_old_demo_accounts() from public, anon, authenticated;

-- Schedule it daily. Re-running replaces the existing job of the same name.
select cron.schedule('cleanup-demo-accounts', '0 4 * * *', 'select public.cleanup_old_demo_accounts()');

-- Check: select * from cron.job where jobname = 'cleanup-demo-accounts';
-- Run now by hand: select public.cleanup_old_demo_accounts();  -- returns how many users it removed
