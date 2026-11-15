// Friends view (Brian picked F1, 2026-11-15), Remind without an email service, and the dark mode switch.
// Accounts are name-only "E2E ..." ones; the nightly cleanup removes them after a day.
import { Browser, check, failureCount, isNotFound, memberIds, run, step } from "./helpers.mjs";

const B = new Browser("Bea"), O = new Browser("Omar");
const bea = `E2E Bea ${run}`, omar = `E2E Omar ${run}`, zed = `E2E Zed ${run}`;
let r, g1, g2, code1, ids = {}, omarId, zedId;

const addExpense = async (who, g, description, amount, paidBy, include) => {
  const page = await who.get(`${g}/expenses/new`);
  ids = memberIds(page.html);
  const form = who.forms(page.html).find((f) => f.includes('name="description"'));
  return who.post(page.url.pathname, form, {
    description, amount, currency: "USD", paid_by: ids[paidBy], category: "general", expense_date: "2026-11-15", notes: "",
    split_type: "equal", ...Object.fromEntries(include.map((n) => [`include_${ids[n]}`, "on"])),
  });
};
const codeOf = (html) => /tracking-\[0\.3em\][^>]*>([A-Z0-9]{6})/.exec(html)?.[1];
// Visible text of the friend row that starts with `name` on the Friends tab.
const row = (t, name) => t.slice(t.indexOf(name), t.indexOf(name) + 90);

await step("two groups shared with Omar, plus a stand-in", async () => {
  await B.submit("/start", "name", { name: bea });
  r = await B.submit("/", "name", { name: `Ski ${run}`, currency: "USD" });
  g1 = r.url.pathname; code1 = codeOf(r.html);
  r = await B.submit("/", "name", { name: `Rent ${run}`, currency: "USD" });
  g2 = r.url.pathname;
  const code2 = codeOf(r.html);
  r = await O.submit(`/join/${code1}`, "name", { name: omar });
  check("Omar joined Ski", r.url.pathname === g1, r.url.href);
  r = await O.submit("/", "code", { code: code2 });
  check("Omar joined Rent", r.url.pathname === g2, r.url.href);
  const page = await B.get(`${g1}/settings`);
  const form = B.forms(page.html).find((f) => f.includes('id="add-person"'));
  await B.post(page.url.pathname, form, { name: zed });
  await addExpense(B, g1, "Lift tickets", "90", bea, [bea, omar, zed]); // Omar and Zed owe Bea 30 each
  await addExpense(O, g2, "Utilities", "40", omar, [bea, omar]);        // Bea owes Omar 20
  omarId = ids[omar]; zedId = ids[zed] ?? memberIds((await B.get(`${g1}/expenses/new`)).html)[zed];
  check("ids found", Boolean(omarId && zedId));
});

await step("Home has Groups | Friends tabs", async () => {
  r = await B.get("/");
  check("tabs with counts", r.text.includes("Groups (2)") && r.text.includes("Friends (2)"), r.text.slice(0, 300));
  check("groups tab is the default", r.html.includes('aria-current="page"') && r.text.includes(`Ski ${run}`));
  r = await B.get("/?tab=friends");
  check("Omar: net across both groups", row(r.text, omar).includes("In 2 groups") && row(r.text, omar).includes("owes you $10.00"), row(r.text, omar));
  check("Zed: not joined yet, owes $30", row(r.text, zed).includes("not joined yet") && row(r.text, zed).includes("owes you $30.00"), row(r.text, zed));
  check("rows link to friend pages", r.html.includes(`href="/friends/${omarId}"`) && r.html.includes(`href="/friends/${zedId}"`));
  r = await O.get("/?tab=friends");
  check("Omar sees he owes Bea $10", row(r.text, bea).includes("you owe $10.00"), row(r.text, bea));
  check("Omar sees Zed settled up", row(r.text, zed).includes("settled up"), row(r.text, zed));
});

await step("friend page: totals, per group, Remind / Record / Settle up", async () => {
  r = await B.get(`/friends/${omarId}`);
  check("summary", r.text.includes(`${omar} owes you $10.00`) && r.text.includes(`In Rent ${run} and Ski ${run}`), r.text.slice(0, 400));
  check("Ski: owes you $30", r.text.includes(`Ski ${run}`) && r.text.includes("owes you $30.00"));
  check("Rent: you owe $20", r.text.includes("you owe $20.00"));
  const remindText = /data-remind-text="([^"]*)"/.exec(r.html)?.[1] ?? "";
  check("Remind shares a drafted message (Omar has no email)", remindText.includes("you owe me $30.00") && remindText.includes(`${g1}/settle?from=${omarId}`), remindText.slice(0, 200));
  check("Record payment prefilled", r.html.includes(`href="${g1}/settle?from=${omarId}&amp;to=`) && r.html.includes("amount=30.00"));
  check("Settle up prefilled", r.html.includes(`href="${g2}/settle?from=`) && r.html.includes(`to=${omarId}&amp;amount=20.00`));
  check("back to Friends", r.html.includes('href="/?tab=friends"'));
  r = await B.get(`/friends/${zedId}`);
  const zedText = /data-remind-text="([^"]*)"/.exec(r.html)?.[1] ?? "";
  check("stand-in reminder carries the invite link", zedText.includes("pick your name") && zedText.includes(`/join/${code1}`), zedText.slice(0, 200));
  r = await B.get("/friends/00000000-0000-4000-8000-000000000000");
  check("unknown friend is a 404", isNotFound(r));
  r = await new Browser("x").get(`/friends/${omarId}`);
  check("signed out goes to sign-in", r.url.pathname === "/login", r.url.href);
});

await step("dark mode switch", async () => {
  r = await B.get("/profile");
  check("Appearance switch on Profile", r.text.includes("Appearance") && r.html.includes("data-theme-switch") && r.text.includes("Auto") && r.text.includes("Dark"));
  check("theme applied before paint", r.html.includes("document.documentElement.dataset.theme"));
});

console.log(failureCount() ? `\n${failureCount()} FAILURES` : "\nALL PASS");
process.exit(failureCount() ? 1 : 0);
