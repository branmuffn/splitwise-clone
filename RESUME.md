# How to pick this project back up

A plain-language guide to stopping, restarting, and finding everything for the Splitwise clone.

---

## The four places your project lives

| Part | What it is | Link / location | When you'll need it |
|---|---|---|---|
| **This folder** | All the code, plus your Supabase keys in `.env.local` | `~/fc/splitwise-clone` on this Mac | Every time. Always start Claude here. |
| **GitHub** | A backup of the code. Pushing to it publishes the site | https://github.com/branmuffn/splitwise-clone | Rarely. Claude pushes for you. |
| **Vercel** | Hosts the live website | https://splitwise-clone-three-theta.vercel.app (dashboard: https://vercel.com, project `splitwise-clone`) | Only if a deploy fails or you change settings. |
| **Supabase** | Database, logins, receipt photos, live updates | https://supabase.com/dashboard, project `tvtlsgeenqftstbqhotv` | When Claude asks you to run SQL or change a setting. |

How they connect: **code in this folder → pushed to GitHub → Vercel builds and publishes it automatically → the site talks to Supabase.**

---

## Stopping

1. Type `/exit` in Claude Code (or press `Ctrl+C` twice).
2. That's it. The website keeps running on its own; nothing needs to be shut down.

---

## Starting again

1. Open **Terminal**.
2. Run:
   ```
   cd ~/fc/splitwise-clone
   claude
   ```
   Starting in this folder is what makes Claude automatically read `CLAUDE.md`, the project's
   instructions and history.
3. Type your request. A good first message:
   > Read CLAUDE.md, README.md, and RESUME.md. Then [describe what you want to do next].

**Other ways to restart:**
- `claude --continue`: reopens your most recent conversation exactly where it left off.
- `claude --resume`: shows a list of past conversations to pick from.
- A fresh `claude` session is usually best. `CLAUDE.md` gives it the full context without the
  old conversation's clutter.

---

## Common tasks and what to say

| You want to… | Tell Claude… |
|---|---|
| Add a feature | "Add [feature]. Follow CLAUDE.md: small steps, test, commit, deploy." |
| Fix something broken on the site | "On the live site, [what you did] and [what went wrong]. Please fix it." |
| Check everything still works | "Run the end-to-end tests against the live site." |
| Clean up test accounts | "Give me the cleanup SQL" (or use the snippet below) |
| See what's planned | "What's in the 'What's next' list in CLAUDE.md?" |

**When Claude says "run this SQL":** it puts the SQL on your clipboard. Then:
1. Go to Supabase → your project → **SQL Editor** → **New query**.
2. Clear the editor, paste (`Cmd+V`), and click **Run**.
3. You should see **"Success. No rows returned."** Reply **"done"** to Claude. If you see red
   error text, copy and paste it to Claude instead.

**Cleanup SQL** (deletes only the automated test accounts and their test data):
```sql
delete from auth.users where email like 'claude-e2e-%@example.com';
```

---

## If something goes wrong

| Problem | What to do |
|---|---|
| Claude can't deploy / Vercel asks you to log in | In Claude Code, type `! npx vercel login` and follow the prompts. |
| Claude can't push to GitHub | Make sure you're signed in to GitHub on this Mac, then ask Claude to retry. |
| The site shows errors after a change | Tell Claude what you saw. Vercel keeps old versions, and Claude can roll back. |
| Sign-up says "email rate limit exceeded" | In Supabase → Authentication → Sign In / Providers → Email, make sure **Confirm email** is OFF. |
| Forgot-password emails link to `localhost` | Supabase → Authentication → URL Configuration: set **Site URL** to the live site and add `https://splitwise-clone-three-theta.vercel.app/**` to Redirect URLs. |

---

## Working on a different computer

1. Install Node.js and Claude Code.
2. Run:
   ```
   git clone https://github.com/branmuffn/splitwise-clone.git
   cd splitwise-clone
   npm install
   ```
3. Create a file named `.env.local` in that folder with these two lines (the values are in
   Supabase → Project Settings → API; never use the *secret* key):
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://tvtlsgeenqftstbqhotv.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   ```
4. Run `npx vercel login`, then `npx vercel link` and pick the `splitwise-clone` project.
5. Start Claude with `claude` as above.

---

## Never share

- The Supabase **secret** / **service_role** key. The app doesn't need it.
- Your passwords. Claude will never need them; for logins, it'll ask you to run a command yourself.
