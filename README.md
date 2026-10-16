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
  subset, by exact amounts, by percentages, or by shares, with a live per-person preview.
  View, edit, and delete.
- **Balances**: per-member, per-currency net balances. Suggested payments either simplified (fewest
  transfers) or pairwise ("who owes whom"), toggled per group.
- **Settle up**: record payments (prefilled from suggestions), delete them to undo.
- **Activity feed** per group: expenses added/edited/deleted, payments, joins/leaves/removals, renames.
- **Dashboard**: your total "you are owed" / "you owe" across groups, per currency.

Not built: currency conversion (balances stay per currency, like Splitwise's default), receipt photos,
real payments, notifications, recurring expenses, comments, charts.

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
