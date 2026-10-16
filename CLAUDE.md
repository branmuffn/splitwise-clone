# Splitwise clone: project context

@AGENTS.md

Frontier Commons build bootcamp, Week 3. A Splitwise clone that grew past the original 3-feature
brief: it now has groups, multi-currency expenses with five split types, payments, recurring
expenses, receipts, comments, charts, CSV export, live updates, and more. See README.md for the full
feature list.

## Where everything lives

| Piece | Where | Notes |
|---|---|---|
| Code | this folder; GitHub `branmuffn/splitwise-clone` (`main`) | Push to `main` and Vercel deploys production automatically |
| Live site | https://splitwise-clone-three-theta.vercel.app | Vercel project `branmuffn/splitwise-clone` |
| Database / auth / storage / realtime | Supabase project `tvtlsgeenqftstbqhotv` | Schema is `supabase/schema.sql` |
| Env vars | `.env.local` (git-ignored) and Vercel Production | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` |

## Working rules (the user's preferences)

- **Stack, no substitutions or extra libraries:** Next.js App Router + TypeScript + Tailwind,
  `@supabase/supabase-js` + `@supabase/ssr`, Vercel. Charts are hand-built (no chart library).
- **Never ask for the Supabase secret/service_role key.** Everything runs as the signed-in user
  under row level security.
- **Database changes:** edit `supabase/schema.sql` (it must stay re-runnable and upgrade older
  versions in place), test it, run `pbcopy < supabase/schema.sql`, then STOP and ask the user to run
  it in the Supabase SQL Editor and reply "done". Don't push app code that needs the new schema
  until they have. Verify afterwards via the REST API (a new table returns `[]`, not `PGRST205`).
  The SQL Editor runs the whole file as one transaction, so one error cancels everything.
- Small steps, one clear git commit per feature, test before committing. Commit and push only
  when asked, or as part of an agreed deploy.
- The user isn't deeply technical: explain status plainly (done / what to check / what's next),
  and put SQL they need to run on their clipboard.

## Commands

```bash
npm run dev            # local dev at http://localhost:3000
npm run build && npx next start -p 3123   # production build locally (what the e2e tests target)
npm test               # unit tests: money, splits, balances, conversion, CSV, filters (node --test)
npm run lint
npx next typegen       # regenerate route types (PageProps<"/groups/[id]">) after adding routes
npm run test:e2e       # end-to-end against SITE (default http://localhost:3123), see below
```

Deploy = `git push` (Vercel builds `main`). Manual fallback: `npx vercel --prod --yes`.

## Architecture

- `src/lib/`: pure, unit-tested logic: `money.ts` (minor units per currency via Intl),
  `splits.ts` (equal/exact/percent/shares/itemized; largest-remainder rounding), `balances.ts`
  (per-currency balances; simplified vs pairwise settle-up), `convert.ts` + `rates.ts`
  (open.er-api.com, no key, cached 1h; attribution link required), `filters.ts`, `csv.ts`.
  `group-data.ts` `loadGroup()` loads everything for a group page under RLS (and calls
  `materialize_recurring`).
- `src/lib/supabase/server.ts`: per-request server client (`createClient`, `getCurrentUser`);
  `client.ts`: browser client, used only for Realtime.
- `src/proxy.ts`: Next 16's renamed middleware. It refreshes the session and redirects signed-out users.
- Server actions live next to their pages (`src/app/groups/*-actions.ts`). They validate input,
  call Supabase, and `redirect()` on success.
- Writes that must be atomic go through SQL RPCs: `save_expense`, `create_group`, `join_group`,
  `leave_group`, `remove_member`, `regenerate_join_code`, `materialize_recurring`. The activity log
  is written only by triggers.
- Receipts: private Storage bucket `receipts`, path `<group_id>/<expense_id>/<file>`, shown via
  10-minute signed URLs.

## Gotchas learned the hard way

- **Next.js 16** differs from older docs: `middleware.ts` became `proxy.ts`, `cookies()` and
  `params` are async, and the bundled docs are in `node_modules/next/dist/docs/`. Cache Components
  are deliberately OFF (`next.config.ts`).
- **Never `.bind()` a server action inside a client component.** It made no-JS form posts that
  return an error hang forever. Bind in the Server Component and pass the bound action as a prop
  (see `ExpenseForm`, `SettleForm`, `GroupSettingsForm`, `CommentForm`, `ActionButton`).
- Don't import plain values from a `"use client"` file into server code (you get a client
  reference, not the value). Shared constants go in `src/lib/` (e.g. `recurring.ts`).
- `createClient()` calls `await connection()` first: Supabase reads `Date.now()` during render.
- Money is always integers in the currency's minor unit (JPY has 0 decimals). Columns are named
  `*_cents` regardless.
- Supabase Realtime sends DB changes a moment *after* `SUBSCRIBED`. Wait for the
  `system` "Subscribed to PostgreSQL" message before expecting events.
- Supabase's built-in email sends only a few messages per hour. "Confirm email" is OFF in this
  project; password reset needs Site URL / Redirect URLs set to the Vercel domain.
- Server action uploads are capped at 5 MB (`next.config.ts`); the browser shrinks photos first.

## End-to-end tests (`tests/e2e/`)

They submit the real HTML forms (as a browser with JS off would) as several fake users against a
running site and the **real** Supabase project: `core.mjs` (earlier features, ~59 checks) and
`extras.mjs` (v3 features incl. receipts and Realtime, ~48 checks).
`SITE=https://splitwise-clone-three-theta.vercel.app npm run test:e2e` runs them against
production. They create users named `claude-e2e-*@example.com`; clean up with this in the SQL
Editor (cascades to their groups and data):

```sql
delete from auth.users where email like 'claude-e2e-%@example.com';
```

Parsing notes: streamed HTML arrives in pieces (`helpers.mjs` `assemble()` stitches React's `$RS`
segments), and every page contains Next's hidden "could not be found" template, so detect a real
404 with `isNotFound()`.

## Current status (as of 2026-10-16)

- **Everything below is built, deployed, and passing** on the live site: core e2e (59 checks),
  extras e2e (48 checks), 23 unit-test groups, and the SQL permission tests.
  - v1: auth, groups with join codes, equal-split expenses, balances.
  - v2: custom splits, multi-currency, categories, edit/delete, payments, activity, group
    settings, dashboard totals, profile, password reset.
  - v3: currency conversion, receipts, recurring, comments, search/filters, CSV, charts,
    reminders, Realtime, itemized bills.
- The live database matches `supabase/schema.sql` (the v3 version, with the guarded
  storage/realtime blocks).
- **Not yet verified by a human in a real browser** (automated tests can't): itemized-bill UI
  interactions, phone camera receipt upload and in-browser resizing, the live-update dot and
  auto-refresh across two browsers, the Remind button opening a mail app, CSV opening in Excel or
  Google Sheets, and chart hover. If the user reports problems, start there.
- Test accounts (`claude-e2e-*@example.com`) may still exist in Supabase; the cleanup SQL is above.
- `RESUME.md` is the user's plain-language guide to stopping and restarting; keep it current if
  URLs, services, or workflow change.

## What's next (user said "good enough for now"; pick from these when they return)

Ask the user which they want; don't start unprompted.

1. **Server-sent reminder emails**, plus optional weekly automatic nudges. Needs an email
   provider (e.g. Resend): the user creates an account and adds `RESEND_API_KEY` to Vercel
   themselves. Call its HTTP API with `fetch` (no SDK, per the no-extra-libraries rule). Weekly
   nudges need a Vercel Cron job, and that needs a way to read balances without the service key
   (e.g. a SECURITY DEFINER RPC guarded by a cron secret).
2. **Friends / 1-on-1 expenses** outside groups (like Splitwise's Friends tab). Simplest model:
   an implicit two-person group per friend pair.
3. **Installable PWA**: web app manifest, icons, and an offline view of balances.
4. **Polish**: dark mode (tokens are in `globals.css`; charts would need dark-validated colors via
   the dataviz skill), avatars/profile photos (Storage), and an "undo delete" for expenses.
5. **CI**: a GitHub Action running `npm test`, lint, build, and the e2e suite against a Vercel
   preview deployment on each pull request.
