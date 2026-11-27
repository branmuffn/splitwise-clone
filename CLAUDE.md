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
| Live site | https://split-tea.vercel.app | Vercel project `branmuffn/splitwise-clone` |
| Database / auth / storage / realtime | Supabase project `tvtlsgeenqftstbqhotv` (region us-west-2, Oregon) | Schema is `supabase/schema.sql` |
| Server region | `vercel.json` `regions: ["pdx1"]` (Portland, next to the database; was iad1, 2026-11-15) | Each page makes several database trips, so this matters |
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

## One-click demo (Demo Day request from Justin)

- "✨ Try the demo (no sign-up)" on `/login` and `/signup` (`src/app/auth/demo-button.tsx`) calls
  `startDemo` (`src/app/auth/actions.ts`), which runs `createDemoAccount` in `src/lib/demo.ts`.
- Each click signs up a **fresh** reviewer account (`demo-<id>@example.com`, display name "Alex (demo)",
  random password nobody knows) on the cookie-backed client, so the reviewer ends up signed in. It
  also signs up two sample friends, Sam and Riley (`demo-friend-<id>@example.com`), on throwaway
  clients, then seeds the data. **Beach trip 🏖️** has equal, itemized (with tax), shares, a percent
  split in EUR, and exact expenses, plus Riley's $100 payment and a comment. **Apartment 🏠** has
  monthly recurring Rent and Internet. It lands on the trip group in about 3 s.
- Why per-click accounts and not one shared login: a shared account could have its data deleted or
  password changed by one reviewer, breaking it for everyone. No service key and no schema change
  needed. It does need Supabase **Confirm email OFF** (sign-up must return a session).
- `isDemoEmail()` drives the amber banner in `AppHeader`. Its "Create a real account" button signs
  out to `/signup`. Signing out ends a demo: the random password is never shown.
- If you change the sample data, update the exact balances asserted in `tests/e2e/demo.mjs`
  (reviewer owed $398.96 and €57.60).
- Cleanup is automatic: `supabase/migrations/20261114120000_demo_cleanup.sql` schedules a daily pg_cron job that deletes
  demo accounts older than 30 days (Brian's choice, 2026-11-14). By hand: `select public.cleanup_old_demo_accounts();`

## Start now, invite links, stand-ins (Brian, 2026-11-15)

- **Start now** (`/start`): a name-only account = Supabase anonymous sign-in (needs Authentication > "Allow anonymous
  sign-ins" ON; it is). Profile email is `''`; `getCurrentUser().nameOnly`. Home shows a reminder to add an email; the
  header's Sign out goes to a warning on `/profile?signout=1`. Profile > "Add an email" = `updateUser({ email, password })`
  (same user id, groups kept); trigger `on_auth_user_email_changed` copies the email to `profiles`.
- **Invite links** `/join/<code>` (public): `group_invite_preview(code)` shows name + member count; a name is enough to
  join (anonymous sign-in, then `join_group`), or sign in with email. Group page and settings: "Copy invite link".
- **Stand-ins**: Settings > Members > "Add someone who isn't here yet". `addStandIn` signs in a fresh anonymous account on
  a throwaway client, then `add_standin(gid, sid)` marks it (`profiles.standin_group`) and adds it to the group. The invite
  page asks "Which one are you?" (`group_standins(code)`); picking one, or "That's me" in Settings, runs
  `claim_standin(sid)`: moves shares (summed if both on an expense), expenses, payments (drops payments between the two),
  comments, activity, `split_details` ids, then deletes the stand-in. `log_activity` is muted during the move
  (`splitwise.quiet`) and one `standin_claimed` entry is written.
- SQL: `supabase/migrations/20261115120000_name_only_accounts.sql` and `20261115130000_standins.sql` (both run in
  production 2026-11-15, mirrored in schema.sql). The nightly cleanup also removes test accounts after 1 day
  (`claude-e2e-*@example.com`, name-only "E2E *") and stand-ins left in no group, and (20261115140000) name-only
  accounts still in no group 30 days after they started (Brian, 2026-11-15).
- Supabase rate-limits anonymous sign-ins (all come from Vercel's servers): keep the limit raised (Auth > Rate Limits).
- Tests: `tests/e2e/nameonly.mjs` (26 checks), `tests/e2e/standins.mjs` (25 checks); both in `npm run test:e2e`.

## Friends, Remind, dark mode (Brian, 2026-11-15)

- **Friends (F1)**: Home has Groups | Friends tabs (`/?tab=friends`); `/friends/[id]` shows totals and a per-group
  breakdown with Remind / Record payment / Settle up. Pure logic `src/lib/friends.ts` (`friendBalances`, unit-tested):
  per group it uses the same transfers as the group page (simplified or pairwise), so numbers match. Loader
  `src/lib/friend-data.ts`. No schema change. 1-on-1 expenses outside groups (F3) were not chosen.
- **Remind, no email service** (Brian declined a domain/email provider): `src/components/remind-button.tsx` +
  `src/lib/remind.ts`. With an email: mailto draft. Without one (name-only, stand-ins): share sheet on phones, copy on
  computers; stand-ins get the invite link. `data-remind-text` holds the message (tests read it).
- **Dark mode (D1 Charcoal)**: all in `globals.css`. Cards/inputs use `bg-surface`, hairlines `border-line` (never
  `bg-white`/`border-black/5` for surfaces; `text-white` stays white). Dark values override Tailwind's palette vars
  (gray scale flipped) under `:root[data-theme=dark]` and the OS media query (declared twice on purpose). Profile >
  Appearance (`src/app/profile/theme-switch.tsx`) writes a `theme` cookie; an inline script in `layout.tsx` applies it
  before paint (not read on the server, so /login, /signup, /start stay static). Chart colors are `--chart-*` vars
  (dark values validated with the dataviz palette validator). Primary buttons hover with `brightness`, not brand-600.
- Tests: `tests/e2e/friends.mjs` (22 checks) in `npm run test:e2e`; unit tests `friends.test.ts`, `remind.test.ts`.

## Look and touch rules (2026-11-27 review, Brian picked M1 A / M3 / M5 A / M6 A)

- **Colors:** brand teal `#0e7a63` (500 and 600) and orange `--color-owe: #c9461b` so white text on them and teal/orange
  text on white pass 4.5:1 (the old #1cc29f / #17a689 / #ff652f were 2.3-3.1:1). Dark mode: teal fills `#0c7360`; orange
  stays light for text, and `.bg-owe` buttons get `#c9461b` (unlayered rule in `globals.css`). Check contrast when adding colors.
- **Confirms:** `ActionButton`'s `confirmText` opens the app's own small `<dialog>` (question, Cancel, the action's
  label; Esc, tap outside, Cancel close it). Never `window.confirm` / `alert`.
- **Icons:** `Chevron` in `src/components/ui.tsx` (left/right/down); never typed ‹ › ▸. Every `<summary>` hides the
  browser marker (`list-none [&::-webkit-details-marker]:hidden`).
- **Tap areas:** small links and chips get `tap-pad` (a bigger invisible area on touch screens, same look; `globals.css`).
- **Empty amounts:** show `$0.00` (`formatMoney(0, currency)`) in grey, never a dash; no em dashes in visible text.
- **Names:** the name truncates but "(you)", "creator" and "not joined yet" are `shrink-0` siblings, always visible.

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

- **Next.js 16.4.6** (2026-11-27 security update; a first local build may stop once with an upgrade notice, rerun it)
  differs from older docs: `middleware.ts` became `proxy.ts`, `cookies()` and
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
running site and the **real** Supabase project: `core.mjs`, `extras.mjs` (receipts, Realtime), `demo.mjs`,
`nameonly.mjs`, `standins.mjs`, `friends.mjs`: 193 checks in all (2026-11-27). Counts of buttons by label must skip
closed `<dialog>`s (the confirm sheet repeats the label).
`SITE=https://split-tea.vercel.app npm run test:e2e` runs them against
production. They create users named `claude-e2e-*@example.com`; clean up with this in the SQL
Editor (cascades to their groups and data):

```sql
delete from auth.users where email like 'claude-e2e-%@example.com';
```

Parsing notes: streamed HTML arrives in pieces (`helpers.mjs` `assemble()` stitches React's `$RS`
segments), and every page contains Next's hidden "could not be found" template, so detect a real
404 with `isNotFound()`.

## Current status (as of 2026-11-27)

- **Everything below is built, deployed, and passing**: e2e 193 checks (6 files), 40 unit tests, and the SQL
  permission tests. Later additions: Start now / invite links / stand-ins, Friends + Remind, dark mode (2026-11-15);
  the 2026-11-27 look and touch fixes above.
  - Demo Day follow-up: one-click demo login (see "One-click demo" above).
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
- Test accounts (`claude-e2e-*@example.com`) and demo accounts (`demo-*@example.com`) accumulate in
  Supabase; both cleanup statements are above.
- `RESUME.md` is the user's plain-language guide to stopping and restarting; keep it current if
  URLs, services, or workflow change.

## What's next (user said "good enough for now"; pick from these when they return)

Ask the user which they want; don't start unprompted.

1. **Server-sent reminder emails** (2026-11-15: Brian chose mailto + share instead, no provider for now), plus optional weekly automatic nudges. Needs an email
   provider (e.g. Resend): the user creates an account and adds `RESEND_API_KEY` to Vercel
   themselves. Call its HTTP API with `fetch` (no SDK, per the no-extra-libraries rule). Weekly
   nudges need a Vercel Cron job, and that needs a way to read balances without the service key
   (e.g. a SECURITY DEFINER RPC guarded by a cron secret).
2. **Friends**: DONE 2026-11-15 (F1). Still open: 1-on-1 expenses outside groups (like Splitwise's Friends tab). Simplest model:
   an implicit two-person group per friend pair.
3. **Installable PWA** (Brian said no for now, 2026-11-15): web app manifest, icons, and an offline view of balances.
4. **Polish**: dark mode DONE 2026-11-15; in-app confirm DONE 2026-11-27; still open: avatars/profile photos (Storage), and an "undo delete" for expenses.
5. **CI**: a GitHub Action running `npm test`, lint, build, and the e2e suite against a Vercel
   preview deployment on each pull request.
