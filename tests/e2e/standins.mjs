// Stand-ins (Brian approved 2026-11-15): add people by name before they join, log and split everything, then each
// person takes over their spot (from the invite link, or "That's me" in Settings) and inherits every share and payment.
// Accounts are named "E2E ..." / claude-e2e-...@example.com; the nightly cleanup removes them after a day.
import { Browser, check, email, failureCount, memberIds, run, step } from "./helpers.mjs";

const B = new Browser("Brian"), S = new Browser("Sam"), R = new Browser("Riley");
const brian = `E2E Bri ${run}`, sam = `E2E Sam ${run}`, riley = `E2E Riley ${run}`, rileyReal = `E2E Riley2 ${run}`;
let r, g, code, ids = {};

// "Name (you) not joined yet gets back $35.00" -> "gets back $35.00"
const bal = (t, name) => {
  const seg = t.split("Balances")[1]?.split(/Suggested payments|Who owes whom/)[0] ?? "";
  // Visible text runs together ("E2E Samnot joined yetowes $15.00E"), so read the first amount after the name.
  // T25 (2026-11-28): "gets back" / "owes" now sits on its own line above the amount, so no space may follow it.
  const m = new RegExp(`${name}(?:\\s*\\(you\\))?(?:\\s*not joined yet)?\\s*(?:(gets back|owes)\\s*([^\\d]*[\\d,]+\\.\\d{2})|(settled up))`).exec(seg);
  return m ? (m[3] ?? `${m[1]} ${m[2].trim()}`) : "";
};
const addPerson = async (who, name) => {
  const page = await who.get(`${g}/settings`);
  const form = who.forms(page.html).find((f) => f.includes('id="add-person"'));
  if (!form) throw new Error("no add-person form");
  return who.post(page.url.pathname, form, { name });
};
const addExpense = async (who, description, amount, paidBy, include) => {
  const page = await who.get(`${g}/expenses/new`);
  ids = memberIds(page.html);
  const form = who.forms(page.html).find((f) => f.includes('name="description"'));
  const extra = Object.fromEntries(include.map((n) => [`include_${ids[n]}`, "on"]));
  return who.post(page.url.pathname, form, { description, amount, currency: "USD", paid_by: ids[paidBy], category: "general",
    expense_date: "2026-11-15", notes: "", split_type: "equal", ...extra });
};

await step("Brian starts a trip and adds two people who haven't joined", async () => {
  await B.submit("/start", "name", { name: brian });
  r = await B.submit("/", "name", { name: `Trip ${run}`, currency: "USD" });
  g = r.url.pathname;
  code = /tracking-\[0\.3em\][^>]*>([A-Z0-9]{6})/.exec(r.html)?.[1];
  check("group page links to adding people by name", r.html.includes(`href="${g}/settings#add-person"`));
  r = await addPerson(B, "   ");
  check("empty name rejected", r.text.includes("Please enter your name."));
  r = await addPerson(B, sam);
  check("stand-in added", r.url.pathname === `${g}/settings` && r.text.includes("Added. They can take over their spot"), r.text.slice(0, 200));
  await addPerson(B, riley);
  r = await B.get(`${g}/settings`);
  check("both show as not joined yet", (r.text.match(/not joined yet/g) ?? []).length === 2 && r.text.includes(sam) && r.text.includes(riley));
  r = await B.get(g);
  check("group has 3 members", r.text.includes("3 members"));
  r = await B.get(`${g}/activity`);
  check("activity says who was added", r.text.includes(`You added ${sam} by name`), r.text.slice(0, 400));
});

await step("Brian logs and splits everything on his own", async () => {
  await addExpense(B, "House", "90", brian, [brian, sam, riley]);       // each owes 30
  await addExpense(B, "Groceries", "30", sam, [brian, sam]);           // Sam paid; Brian and Sam 15 each
  r = await B.submit(`${g}/settle`, "from_user", { from_user: ids[riley], to_user: ids[brian], amount: "10", currency: "USD", paid_on: "2026-11-15", note: "" });
  r = await B.get(g);
  check("Brian gets back $35", bal(r.text, brian) === "gets back $35.00", bal(r.text, brian));
  check("Sam owes $15", bal(r.text, sam) === "owes $15.00", bal(r.text, sam));
  check("Riley owes $20", bal(r.text, riley) === "owes $20.00", bal(r.text, riley));
  const remindText = /data-remind-text="([^"]*)"/.exec(r.html)?.[1] ?? "";
  check("Remind for stand-ins shares the invite link (no email)", remindText.includes("pick your name") && remindText.includes(`/join/${code}`) && !r.html.includes("mailto:"), remindText.slice(0, 160));
});

await step("Sam opens the invite link and picks his name", async () => {
  r = await S.get(`/join/${code}`);
  check("invite lists the stand-ins", r.text.includes("Which one are you?") && r.text.includes(sam) && r.text.includes(riley) && r.text.includes("I'm someone new"));
  const form = S.forms(r.html).find((f) => f.includes('name="standin"') && f.includes('name="name"'));
  const samId = new RegExp(`value="([0-9a-f-]{36})"[^>]*>[\\s\\S]*?${sam}`).exec(form)?.[1] ?? ids[sam];
  r = await S.post(`/join/${code}`, form, { standin: samId, name: "" });
  check("Sam lands in the group", r.url.pathname === g && r.text.includes("Everything logged for you is now yours"), r.url.href);
  check("still 3 members", r.text.includes("3 members"));
  check("Sam owes $15 (inherited)", bal(r.text, sam) === "owes $15.00", bal(r.text, sam));
  check("Sam is no longer a stand-in", !new RegExp(`${sam} \\(you\\) not joined yet`).test(r.text) && (r.text.match(/not joined yet/g) ?? []).length === 1);
  r = await S.get(`/join/${code}`);
  check("link now lists only Riley (or says already in)", !r.text.includes(`${sam}\n`) && (r.text.includes("You're already in") || !r.text.includes(sam)));
  r = await B.get(`${g}/activity`);
  check("activity: Sam took over", r.text.includes(`${sam} joined and took over “${sam}”`), r.text.slice(0, 400));
  check("no noise from the move", !r.text.includes("updated “House”") && !r.text.includes("updated “Groceries”"));
});

await step("Riley joins with an email account, then taps That's me", async () => {
  await R.submit("/signup", "email", { name: rileyReal, email: email("riley"), password: "testpass123" });
  await R.submit("/", "code", { code });
  r = await R.get(`${g}/settings`);
  const form = R.forms(r.html).find((f) => />\s*That's me\s*</.test(f.replace(/&#x27;/g, "'")));
  check("That's me button next to the stand-in", Boolean(form));
  r = await R.post(`${g}/settings`, form, {});
  check("Riley took over", r.url.pathname === g && r.text.includes("Everything logged for you is now yours"), r.url.href);
  check("Riley owes $20, payment kept", bal(r.text, rileyReal) === "owes $20.00", bal(r.text, rileyReal));
  check("3 members, nobody waiting", r.text.includes("3 members") && !r.text.includes("not joined yet"));
  r = await B.get(g);
  check("Brian still gets back $35", bal(r.text, brian) === "gets back $35.00", bal(r.text, brian));
  check("Remind emails Riley (has an email)", /href="mailto:[^"]+"/.test(r.html));
});

await step("someone can't take a spot that's gone", async () => {
  const X = new Browser("X");
  r = await X.get(`/join/${code}`);
  const form = X.forms(r.html).find((f) => f.includes('name="name"'));
  r = await X.post(`/join/${code}`, form, { standin: "00000000-0000-0000-0000-000000000000", name: "E2E X" });
  check("unknown stand-in refused", r.text.includes("That person has already joined"));
});

console.log(failureCount() ? `\n${failureCount()} FAILURES` : "\nALL PASS");
process.exit(failureCount() ? 1 : 0);
