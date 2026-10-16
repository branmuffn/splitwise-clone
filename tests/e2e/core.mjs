// Full feature test: submits the real forms (no-JS progressive enhancement) as several users.
const SITE = process.env.SITE ?? "http://localhost:3123";
const run = Date.now().toString(36);
let failures = 0;
const check = (n, c, x = "") => { console.log(`${c ? "PASS" : "FAIL"} ${n}${x && !c ? " — " + x : ""}`); if (!c) failures++; };
const decode = (s) => s.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const attr = (tag, name) => { const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag); return m ? decode(m[1]) : null; };
// Visible text: strip scripts and tags, decode entities, collapse whitespace.
const text = (html) => decode(html.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, "")).replace(/\s+/g, " ");

// Apply React's streamed segment swaps ($RS("S:n","P:n")) so the HTML reads like the final DOM.
function assemble(html) {
  for (let i = 0; i < 50; i++) {
    const m = /<div hidden id="(S:\d+)">([\s\S]*?)<\/div><script>(?:\$RS=function[^<]*?;)?\$RS\("\1","(P:\d+)"\)<\/script>/.exec(html);
    if (!m) break;
    html = html.replace(m[0], "").replace(`<template id="${m[3]}"></template>`, m[2]);
  }
  return html;
}

class Browser {
  constructor(label) { this.label = label; this.jar = new Map(); }
  cookieHeader() { return [...this.jar].map(([k, v]) => `${k}=${v}`).join("; "); }
  store(res) {
    for (const c of res.headers.getSetCookie()) {
      const [pair, ...attrs] = c.split(";");
      const i = pair.indexOf("=");
      const k = pair.slice(0, i).trim(), v = pair.slice(i + 1);
      (attrs.some((a) => /max-age=0/i.test(a)) || v === "") ? this.jar.delete(k) : this.jar.set(k, v);
    }
  }
  async request(path, init = {}) {
    let url = new URL(path, SITE), res;
    for (let i = 0; i < 6; i++) {
      res = await fetch(url, { ...init, signal: AbortSignal.timeout(30000), redirect: "manual", headers: { ...init.headers, Cookie: this.cookieHeader() } });
      this.store(res);
      if (res.status < 300 || res.status >= 400) break;
      url = new URL(res.headers.get("location"), url);
      init = {};
    }
    const html = assemble(await res.text());
    return { status: res.status, url, html, text: text(html) };
  }
  get(path) { return this.request(path); }
  forms(html) { return [...html.matchAll(/<form\b[^>]*>[\s\S]*?<\/form>/g)].map((m) => m[0]); }
  async post(pagePath, form, fields) {
    const body = new FormData();
    for (const [tag] of form.matchAll(/<input\b[^>]*>/g)) {
      const name = attr(tag, "name");
      if (name && attr(tag, "type") === "hidden") body.append(name, attr(tag, "value") ?? "");
    }
    for (const [k, v] of Object.entries(fields)) if (v !== undefined) body.append(k, v);
    return this.request(pagePath, { method: "POST", body, headers: { Origin: SITE } });
  }
  // Submit the form that contains an input named `marker`.
  async submit(path, marker, fields = {}) {
    const page = await this.get(path);
    const form = this.forms(page.html).find((f) => f.includes(`name="${marker}"`));
    if (!form) throw new Error(`${this.label}: no form with field ${marker} on ${path}`);
    return this.post(page.url.pathname, form, fields);
  }
  // Submit the one-button form whose button text matches.
  async click(path, buttonText) {
    const page = await this.get(path);
    const forms = this.forms(page.html).filter((f) => new RegExp(`<button[^>]*>\\s*${buttonText}\\s*</button>`).test(f));
    if (!forms.length) throw new Error(`${this.label}: no "${buttonText}" button on ${path}`);
    return this.post(page.url.pathname, forms[0], {});
  }
}

// href of the <a> whose visible text includes `label`.
const linkTo = (html, label) => [...html.replace(/<script[\s\S]*?<\/script>/g, "").matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].find((m) => text(m[2]).includes(label))?.[1];
const isNotFound = (r) => r.html.includes("NEXT_HTTP_ERROR_FALLBACK;404") && !r.text.includes("Invite code");
const memberIds = (html) => Object.fromEntries([...html.matchAll(/<option value="([0-9a-f-]{36})"[^>]*>([^<(]+)/g)].map((m) => [m[2].trim(), m[1]]));
const email = (n) => `claude-e2e-${n}-${run}@example.com`;
const step = async (name, fn) => { try { await fn(); } catch (e) { check(name, false, e.message); } };

const A = new Browser("A"), B = new Browser("B"), C = new Browser("C"), D = new Browser("D");
let r, gid, code, ids, g;

await step("signup", async () => {
  r = await A.submit("/signup", "email", { name: "Alice", email: email("alice"), password: "testpass123" });
  check("Alice signs up", r.text.includes("Hi, Alice"));
  r = await B.submit("/signup", "email", { name: "Bob", email: email("bob"), password: "testpass123" });
  await C.submit("/signup", "email", { name: "Carol", email: email("carol"), password: "testpass123" });
  await D.submit("/signup", "email", { name: "Dave", email: email("dave"), password: "testpass123" });
  check("dashboard shows totals card", r.text.includes("You are owed") && r.text.includes("You owe"));
});

await step("create group", async () => {
  r = await A.submit("/", "name", { name: `Euro trip ${run}`, currency: "EUR" });
  gid = r.url.pathname.split("/")[2];
  code = /tracking-\[0\.3em\][^>]*>([A-Z0-9]{6})/.exec(r.html)?.[1];
  g = `/groups/${gid}`;
  check("group created with EUR default", r.text.includes("· EUR") && Boolean(code), r.text.slice(0, 300));
  await B.submit("/", "code", { code });
  r = await A.get(g);
  check("Bob joined", r.text.includes("2 members"));
});

const addExpense = async (who, fields, splits) => {
  const page = await who.get(`${g}/expenses/new`);
  ids = memberIds(page.html);
  const form = who.forms(page.html).find((f) => f.includes('name="description"'));
  const extra = {};
  for (const [name, v] of Object.entries(splits.values ?? {})) extra[`value_${ids[name]}`] = v;
  for (const name of splits.include ?? []) extra[`include_${ids[name]}`] = "on";
  return who.post(page.url.pathname, form, {
    description: fields.description, amount: fields.amount, currency: fields.currency,
    paid_by: ids[fields.paidBy], category: fields.category ?? "general", expense_date: fields.date ?? "2026-10-10",
    notes: fields.notes ?? "", split_type: splits.type, ...extra,
  });
};
const bal = (t, name, cur) => {
  // From the Balances card text: "Alice (you) gets back $15.00 €20.00 ..." — pull the member's segment.
  const seg = t.split("Balances")[1]?.split(/Suggested payments|Who owes whom/)[0] ?? "";
  const m = new RegExp(`${name}(?: \\(you\\))?((?:\\s*(?:gets back|owes) [^A-Z]*?\\S+)*|\\s*settled up)`).exec(seg);
  return m?.[1]?.trim() ?? "";
};

await step("expenses with all split types", async () => {
  r = await addExpense(A, { description: "Dinner", amount: "30", currency: "USD", paidBy: "Alice", category: "food", notes: "Tapas night" }, { type: "equal", include: ["Alice", "Bob"] });
  check("equal split USD added", r.url.pathname === g && r.text.includes("Dinner"), r.text.slice(0, 400));
  r = await addExpense(A, { description: "Hotel", amount: "50", currency: "EUR", paidBy: "Alice", category: "travel" }, { type: "exact", values: { Alice: "30", Bob: "20" } });
  check("exact split EUR added", r.text.includes("Hotel"));
  r = await addExpense(B, { description: "Museum", amount: "100", currency: "GBP", paidBy: "Bob", category: "entertainment" }, { type: "percent", values: { Alice: "25", Bob: "75" } });
  check("percent split GBP added", r.text.includes("Museum"));
  r = await addExpense(B, { description: "Sushi", amount: "3000", currency: "JPY", paidBy: "Alice", category: "food" }, { type: "shares", values: { Alice: "2", Bob: "1" } });
  check("shares split JPY added", r.text.includes("Sushi"));

  r = await A.get(g);
  const t = r.text;
  check("USD: Alice +$15.00", /You are owed \$15\.00/.test(t), t.slice(0, 600));
  check("EUR: Alice +€20.00", /You are owed €20\.00/.test(t));
  check("GBP: Alice owes £25.00", /You owe £25\.00/.test(t));
  check("JPY: Alice +¥1,000", /You are owed ¥1,000/.test(t));
  check("expense row shows 'you lent'", t.includes("you lent"));
  check("category icons shown", r.html.includes("🍽️") && r.html.includes("✈️"));
  check("suggested payments per currency", t.includes("Bob owes you $15.00") && t.includes("You owe Bob £25.00"));
});

await step("validation errors", async () => {
  r = await addExpense(A, { description: "Bad exact", amount: "50", currency: "USD", paidBy: "Alice" }, { type: "exact", values: { Alice: "10", Bob: "10" } });
  check("exact mismatch error", r.html.includes("$30.00 left to assign."));
  r = await addExpense(A, { description: "Bad pct", amount: "50", currency: "USD", paidBy: "Alice" }, { type: "percent", values: { Alice: "50", Bob: "40" } });
  check("percent != 100 error", r.html.includes("Percentages add up to 90%, not 100%."));
  r = await addExpense(A, { description: "Bad yen", amount: "10.50", currency: "JPY", paidBy: "Alice" }, { type: "equal", include: ["Alice", "Bob"] });
  check("JPY decimals rejected", r.html.includes("no decimals for yen"));
  r = await addExpense(A, { description: "Nobody", amount: "10", currency: "USD", paidBy: "Alice" }, { type: "equal", include: [] });
  check("equal with nobody rejected", r.html.includes("Choose at least one person."));
});

let dinnerUrl;
await step("expense detail, edit, delete", async () => {
  r = await A.get(g);
  dinnerUrl = linkTo(r.html, "Dinner");
  check("non-member 404 detector works on a fake id", isNotFound(await A.get(`${g}/expenses/00000000-0000-0000-0000-000000000000`)));
  check("found Dinner link", Boolean(dinnerUrl));
  check("real expense page is not a 404", !isNotFound(await B.get(dinnerUrl)));
  r = await B.get(dinnerUrl);
  check("detail shows split + notes", r.text.includes("Alice paid $30.00") && r.text.includes("You owe $15.00") && r.text.includes("Tapas night") && r.text.includes("Food & drink"), r.text.slice(0, 500));

  const page = await A.get(`${dinnerUrl}/edit`);
  check("edit form prefilled", page.html.includes('value="30.00"') && page.html.includes("Tapas night"));
  const form = A.forms(page.html).find((f) => f.includes('name="description"'));
  ids = memberIds(page.html);
  r = await A.post(page.url.pathname, form, {
    description: "Dinner (edited)", amount: "40", currency: "USD", paid_by: ids.Alice, category: "food",
    expense_date: "2026-10-10", notes: "Tapas night", split_type: "equal", [`include_${ids.Alice}`]: "on", [`include_${ids.Bob}`]: "on",
  });
  check("edit saves and shows new amount", r.url.pathname === dinnerUrl && r.text.includes("Dinner (edited)") && r.text.includes("$40.00"), r.url.pathname);
  r = await A.get(g);
  check("USD now Alice +$20.00", /You are owed \$20\.00/.test(r.text));

  const museum = linkTo(r.html, "Museum");
  r = await B.click(museum, "Delete");
  check("delete expense redirects with notice", r.url.pathname === g && r.text.includes("Expense deleted."));
  check("GBP balance gone", !r.text.includes("£25.00"));
});

await step("payments", async () => {
  r = await B.get(`${g}/settle`);
  check("settle page prefilled with Bob's debt", /value="20\.00"|value="20"/.test(r.html) || r.html.includes("¥1000") || /name="amount"[^>]*value="[\d.]+"/.test(r.html));
  ids = memberIds(r.html);
  r = await B.submit(`${g}/settle`, "from_user", { from_user: ids.Bob, to_user: ids.Alice, amount: "20", currency: "USD", paid_on: "2026-10-12", note: "Venmo" });
  check("payment recorded", r.url.pathname === g && r.text.includes("Payment recorded.") && r.text.includes("You paid Alice $20.00"), r.text.slice(0, 300));
  check("USD settled for Bob", !/You owe \$/.test(r.text));
  r = await A.get(g);
  check("Alice no longer owed USD", !/You are owed \$/.test(r.text));
  r = await A.click(g, "Delete");
  check("payment deleted, USD owed again", r.text.includes("Payment deleted.") && /You are owed \$20\.00/.test(r.text));
  r = await B.submit(`${g}/settle`, "from_user", { from_user: ids.Bob, to_user: ids.Bob, amount: "5", currency: "USD", paid_on: "2026-10-12" });
  check("payment to self rejected", r.html.includes("Payer and recipient must be different people."));
});

await step("simplify toggle", async () => {
  r = await A.submit(`${g}/settings`, "simplify_debts", { name: `Euro trip ${run}`, currency: "EUR" }); // unchecked = off
  check("settings saved, simplify off", r.text.includes("Settings saved.") && !r.html.match(/name="simplify_debts"[^>]*checked/));
  r = await A.get(g);
  check("group shows 'Who owes whom' when off", r.text.includes("Who owes whom"));
  r = await A.submit(`${g}/settings`, "simplify_debts", { name: `Euro trip ${run}`, currency: "EUR", simplify_debts: "on" });
  r = await A.get(g);
  check("'Suggested payments' when on", r.text.includes("Suggested payments"));
});

await step("rename + activity", async () => {
  await A.submit(`${g}/settings`, "simplify_debts", { name: `Euro trip 2 ${run}`, currency: "EUR", simplify_debts: "on" });
  r = await B.get(`${g}/activity`);
  const t = r.text;
  check("activity lists adds/edits/deletes/payments/joins/rename",
    t.includes("added “Hotel”") && t.includes("updated “Dinner (edited)”") && t.includes("deleted “Museum”") &&
    t.includes("recorded a payment") && t.includes("deleted a payment") && t.includes("You joined the group") && t.includes("Alice joined the group") && t.includes("renamed the group"), t.slice(0, 900));
});

await step("members, codes, leave, remove", async () => {
  await C.submit("/", "code", { code });
  r = await A.click(`${g}/settings`, "New code");
  const newCode = /tracking-\[0\.3em\][^>]*>([A-Z0-9]{6})/.exec(r.html)?.[1];
  check("new invite code", r.text.includes("New invite code created") && newCode && newCode !== code);
  r = await D.submit("/", "code", { code });
  check("old code rejected", r.html.includes("No group found with that code"));
  r = await B.click(`${g}/settings`, "Leave group");
  check("Bob can't leave with a balance", r.html.includes("Settle up your balance before leaving the group"));
  // Remove buttons carry the member id in their bound action args.
  const who = memberIds((await A.get(`${g}/expenses/new`)).html);
  const removeForm = (html, uid) => A.forms(html).find((f) => /Remove\s*<\/button>/.test(f) && decode(f).includes(uid));
  const page = await A.get(`${g}/settings`);
  r = await A.post(page.url.pathname, removeForm(page.html, who.Carol), {});
  check("settled Carol removed", r.text.includes("Member removed.") && !r.text.includes(email("carol")), r.text.slice(0, 300));
  r = await C.get(g);
  check("Carol lost access", isNotFound(r));
  const p2 = await A.get(`${g}/settings`);
  r = await A.post(p2.url.pathname, removeForm(p2.html, who.Bob), {});
  check("can't remove Bob with balance", r.html.includes("must be settled up before they can be removed"));
});

await step("dashboard totals", async () => {
  r = await A.get("/");
  const t = r.text;
  check("totals: owed $20.00, €20.00, ¥1,000", t.includes("$20.00") && t.includes("€20.00") && t.includes("¥1,000"), t.slice(0, 500));
  check("group row shows per-currency balance", t.includes("you are owed"));
});

await step("profile + password", async () => {
  r = await B.submit("/profile", "currency", { name: "Bobby", currency: "GBP" });
  check("profile saved", r.text.includes("Profile saved.") && r.text.includes("Bobby"));
  r = await B.get("/");
  check("create-group currency defaults to GBP", /<option value="GBP" selected/.test(r.html));
  r = await B.submit("/profile", "confirm", { password: "newpass456", confirm: "nope" });
  check("password mismatch rejected", r.html.includes("Passwords don&#x27;t match") || r.html.includes("Passwords don't match"));
  r = await B.submit("/profile", "confirm", { password: "newpass456", confirm: "newpass456" });
  check("password changed", r.text.includes("Password updated."));
  const B2 = new Browser("B2");
  r = await B2.submit("/login", "password", { email: email("bob"), password: "newpass456" });
  check("login with new password", r.url.pathname === "/" && r.text.includes("Hi, Bobby"));
  r = await new Browser("x").get("/forgot-password");
  check("forgot-password page public", r.status === 200 && r.text.includes("Reset your password"));
  r = await new Browser("x").get("/login");
  check("login has forgot link", r.html.includes('href="/forgot-password"'));
});

await step("delete group", async () => {
  r = await B.get(`${g}/settings`);
  check("non-creator has no delete button", !r.text.includes("Delete group"));
  r = await A.click(`${g}/settings`, "Delete group");
  check("creator deletes group", r.url.pathname === "/" && r.text.includes("Group deleted."));
  r = await B.get(g);
  check("group gone for Bob", isNotFound(r));
});

await step("last member leaving deletes group", async () => {
  r = await D.submit("/", "name", { name: `Solo ${run}`, currency: "USD" });
  const solo = r.url.pathname;
  r = await D.click(`${solo}/settings`, "Leave group");
  check("left solo group", r.url.pathname === "/" && r.text.includes("You left the group.") && !r.text.includes(`Solo ${run}`));
});

console.log(failures ? `\n${failures} FAILURES` : "\nALL PASS");
