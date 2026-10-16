# Splitwise clone

Frontier Commons build bootcamp, Week 3. Live: https://splitwise-clone-three-theta.vercel.app

Next.js (App Router) + TypeScript + Tailwind, Supabase for auth and data, deployed on Vercel.
Pushing to `main` on GitHub deploys to production automatically.

## Features

- **Accounts**: email + password sign up / sign in / sign out, forgot-password email, change password,
  editable display name and default currency.
- **Groups**: create (auto 6-character join code) or join by code; rename, set a default currency,
  regenerate the code, remove settled members, leave (must be settled), delete (creator only).
- **Expenses**: description, amount, currency, payer, category, date, notes. Split equally among any
  subset, by exact amounts, by percentages, by shares, or **itemized** (items per person, tax and tip
  shared proportionally), with a live per-person preview. View, edit, and delete.
- **Receipts**: attach a photo or PDF (private Supabase Storage; members only).
- **Recurring expenses**: weekly, every 2 weeks, monthly, or yearly; due copies are added
  automatically when anyone in the group opens the app.
- **Comments** on each expense.
- **Balances**: per-member, per-currency net balances. Suggested payments either simplified (fewest
  transfers) or pairwise ("who owes whom"), toggled per group.
- **Settle up**: record payments (prefilled from suggestions), delete them to undo.
- **Activity feed** per group: expenses added/edited/deleted, payments, comments, joins/leaves/removals,
  renames, automatic recurring adds.
- **Dashboard**: your total "you are owed" / "you owe" across groups, per currency, plus an approximate
  overall total converted to your default currency.
- **Currency conversion**: view a group's balances and suggested payments all in its default currency
  at today's rates (open.er-api.com, no key needed).
- **Search & filters** (text, category, person, currency, dates) and **CSV export**.
- **Charts**: spending by category, by month, and paid-vs-share per person.
- **Reminders**: "Remind" opens a prefilled email to whoever owes you.
- **Live updates**: group pages refresh automatically via Supabase Realtime.

Not built: real payments, push notifications, and server-sent email (reminders use your own email app;
sending from the server would need an email provider API key).

## Setup

1. Run `supabase/schema.sql` in the Supabase SQL Editor. It's re-runnable and upgrades older versions
   of this schema in place.
2. In Supabase **Authentication → Sign In / Providers → Email**, enable the Email provider.
   Turning off "Confirm email" makes testing easier.
3. For password-reset emails, set **Authentication → URL Configuration → Site URL** to your deployed
   URL and add `<your-url>/**` and `http://localhost:3000/**` to Redirect URLs.
4. Create `.env.local`:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://<project-id>.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   ```
5. `npm install && npm run dev`

`npm test` runs the money, split, and balance unit tests (Node's built-in test runner).

## How it works

- Money is stored as integers in each currency's minor unit (cents, or whole yen for JPY).
  `src/lib/money.ts` parses and formats using `Intl.NumberFormat` decimals for each currency.
- `src/lib/splits.ts` turns a split choice into exact per-person shares that always sum to the total
  (largest-remainder rounding, ties to earlier members). The form uses it for the live preview; the
  server action recomputes with the same code and saves through the `save_expense` RPC, which writes
  the expense and its splits in one transaction and re-checks that shares add up.
- `src/lib/balances.ts` computes per-currency balances from expenses, splits, and payments, plus both
  settle-up modes.
- Row level security on every table: you only see groups you belong to, plus their members, expenses,
  splits, payments, and activity. Policies use the `SECURITY DEFINER` helper `is_group_member(group_id)`
  to avoid recursion on `group_members`. Joining, leaving, removing members, and regenerating codes go
  through RPCs; the activity log is written only by triggers.
