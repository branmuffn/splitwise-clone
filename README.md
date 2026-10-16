# Splitwise clone

Frontier Commons build bootcamp, Week 3. Live: https://splitwise-clone-three-theta.vercel.app

Next.js (App Router) + TypeScript + Tailwind, Supabase for auth and data, deployed on Vercel.

## Features

- **Groups**: email + password auth; create a group (auto 6-character join code) or join one by code.
- **Expenses**: description, amount, who paid; split equally among all members; newest first.
- **Balances**: each member's net balance and an "X owes Y $Z" settle-up list.

Faked: greedy settle-up instead of Splitwise's debt simplification; USD only.
Not built: multiple currencies, uneven splits, receipts, recording payments, notifications.

## Setup

1. Run `supabase/schema.sql` in the Supabase SQL Editor (safe to re-run).
2. In Supabase **Authentication → Sign In / Providers → Email**, make sure the Email provider is enabled.
   Turning off "Confirm email" makes testing easier.
3. Create `.env.local`:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://<project-id>.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   ```
4. `npm install && npm run dev`

`npm test` runs the money and balance unit tests (Node's built-in test runner).

## Deploy

```
npx vercel --prod --yes
printf '<url>' | npx vercel env add NEXT_PUBLIC_SUPABASE_URL production
printf '<key>' | npx vercel env add NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY production
npx vercel --prod --yes   # redeploy so the build picks up the env vars
```

## How it works

- Amounts are integer cents. When an amount doesn't divide evenly, leftover cents go one each to members in join order, so balances always sum to zero (`src/lib/balances.ts`).
- Row level security on every table: you only see groups you belong to, plus their members and expenses. Policies use the `SECURITY DEFINER` helper `is_group_member(group_id)` to avoid recursion on `group_members`.
- Creating and joining groups go through `create_group` / `join_group` RPCs, so non-members can join by code without being able to list groups.
