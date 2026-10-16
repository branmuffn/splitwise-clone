// End-to-end test for the v3 features, submitting real forms as several users.
import { Browser, SITE, check, email, failureCount, isNotFound, linkTo, memberIds, run, step } from "./helpers.mjs";
import { createClient } from "@supabase/supabase-js";

const SB_URL = "https://tvtlsgeenqftstbqhotv.supabase.co";
const SB_KEY = "sb_publishable_r9Cpzr6yf_ssyh64rVCmMw_yZ3Cjizt";
const A = new Browser("A"), B = new Browser("B"), C = new Browser("C");
let r, g, gid, ids;
const daysAgo = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);

async function addExpense(who, fields) {
  const page = await who.get(`${g}/expenses/new`);
  const form = who.forms(page.html).find((f) => f.includes('name="description"'));
  return who.post(page.url.pathname, form, { category: "general", expense_date: daysAgo(1), notes: "", repeat_interval: "none", ...fields });
}

await step("setup", async () => {
  await A.submit("/signup", "email", { name: "Alice", email: email("alice"), password: "testpass123" });
  await B.submit("/signup", "email", { name: "Bob", email: email("bob"), password: "testpass123" });
  await C.submit("/signup", "email", { name: "Carol", email: email("carol"), password: "testpass123" });
  r = await A.submit("/", "name", { name: `V3 ${run}`, currency: "USD" });
  g = r.url.pathname;
  gid = g.split("/")[2];
  const code = /tracking-\[0\.3em\][^>]*>([A-Z0-9]{6})/.exec(r.html)[1];
  await B.submit("/", "code", { code });
  ids = memberIds((await A.get(`${g}/expenses/new`)).html);
  check("setup: group with Alice + Bob", Boolean(ids.Alice && ids.Bob));
});

await step("itemized bill", async () => {
  r = await addExpense(A, {
    description: "Pizza night", currency: "USD", paid_by: ids.Alice, category: "food", split_type: "itemized", amount: "",
    item_count: "3",
    item_0_name: "Pizza", item_0_price: "20", [`item_0_who_${ids.Alice}`]: "on", [`item_0_who_${ids.Bob}`]: "on",
    item_1_name: "Wine", item_1_price: "30", [`item_1_who_${ids.Alice}`]: "on",
    item_2_name: "", item_2_price: "",
    tax: "5", tip: "5",
  });
  check("itemized saved", r.url.pathname === g && r.text.includes("Pizza night"), r.text.slice(0, 300));
  const url = linkTo(r.html, "Pizza night");
  r = await B.get(url);
  // subtotals A 40, B 10; extras 10 split 8/2 -> A 48, B 12; total 60
  check("itemized total $60.00 and Bob owes $12.00", r.text.includes("$60.00") && r.text.includes("You owe $12.00"), r.text.slice(0, 600));
  check("items listed with tax and tip", r.text.includes("Pizza") && r.text.includes("Wine") && r.text.includes("Tax") && r.text.includes("Tip"));
  r = await A.get(`${url}/edit`);
  check("edit reopens items", r.html.includes('value="Wine"') && r.html.includes('value="30.00"'));
  r = await addExpense(A, { description: "Bad items", currency: "USD", paid_by: ids.Alice, split_type: "itemized", item_count: "1", item_0_name: "Soup", item_0_price: "8" });
  check("item with nobody rejected", r.html.includes("Choose who had “Soup”."));
});

await step("percent details kept for edit", async () => {
  r = await addExpense(A, { description: "Groceries", amount: "90", currency: "USD", paid_by: ids.Alice, split_type: "percent", [`value_${ids.Alice}`]: "33.33", [`value_${ids.Bob}`]: "66.67" });
  r = await A.get(`${linkTo(r.html, "Groceries")}/edit`);
  check("edit shows the exact percentages typed", r.html.includes('value="33.33"') && r.html.includes('value="66.67"'));
});

await step("recurring", async () => {
  r = await addExpense(A, { description: "Rent", amount: "1000", currency: "USD", paid_by: ids.Alice, category: "housing", split_type: "equal", [`include_${ids.Alice}`]: "on", [`include_${ids.Bob}`]: "on", expense_date: daysAgo(70), repeat_interval: "monthly" });
  r = await B.get(g);
  const rents = (r.text.match(/Rent🔁/g) ?? []).length;
  check("monthly rent from 70 days ago: original + 2 copies, marked 🔁", rents === 3, `found ${rents}`);
  const original = linkTo(r.html, "Rent");
  r = await B.get(original);
  const isOriginal = r.text.includes("Repeats every month");
  const target = isOriginal ? original : null;
  if (!target) {
    // linkTo picked a copy (newest first): check the copy label, then open the original from it.
    check("copy says it was added automatically", r.text.includes("Added automatically from a recurring expense"));
  }
  r = await B.get(g);
  const rentLinks = [...r.html.matchAll(/href="(\/groups\/[^"]+\/expenses\/[0-9a-f-]{36})"/g)].map((m) => m[1]);
  let orig;
  for (const l of rentLinks) {
    const p = await B.get(l);
    if (p.text.includes("Repeats every month")) { orig = l; r = p; break; }
  }
  check("original shows schedule", Boolean(orig));
  r = await B.click(orig, "Stop repeating");
  check("stop repeating works", r.text.includes("This expense will no longer repeat.") && !r.text.includes("Repeats every month"));
  r = await A.get(`${g}/activity`);
  check("activity shows automatic recurring adds", r.text.includes("Recurring expense “Rent”") && r.text.includes("added automatically"));
});

let receiptExpense, signedUrl;
await step("receipts", async () => {
  // 1x1 PNG
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
  r = await addExpense(A, {
    description: "Taxi with receipt", amount: "25", currency: "USD", paid_by: ids.Alice, category: "transport", split_type: "equal",
    [`include_${ids.Alice}`]: "on", [`include_${ids.Bob}`]: "on",
    receipt: new File([png], "receipt.png", { type: "image/png" }),
  });
  check("expense with receipt saved", r.url.pathname === g && !r.url.search.includes("receipt=failed"), r.url.href);
  check("receipt badge on list", /Taxi with receipt.*📎/.test(r.text));
  receiptExpense = linkTo(r.html, "Taxi with receipt");
  r = await B.get(receiptExpense);
  signedUrl = /<img src="([^"]+)" alt="Receipt for/.exec(r.html)?.[1]?.replace(/&amp;/g, "&");
  check("detail page shows receipt image", Boolean(signedUrl));
  const img = await fetch(signedUrl);
  check("signed receipt URL serves the image", img.ok && img.headers.get("content-type")?.includes("image/png"), `${img.status} ${img.headers.get("content-type")}`);
  r = await addExpense(A, {
    description: "Bad receipt", amount: "5", currency: "USD", paid_by: ids.Alice, split_type: "equal", [`include_${ids.Alice}`]: "on",
    receipt: new File(["hello"], "notes.txt", { type: "text/plain" }),
  });
  check("non-image receipt rejected", r.html.includes("Receipts must be a JPG, PNG, WebP, GIF, or PDF."));
  // remove receipt via edit
  const page = await A.get(`${receiptExpense}/edit`);
  check("edit offers 'remove receipt'", page.html.includes('name="remove_receipt"'));
  const form = A.forms(page.html).find((f) => f.includes('name="description"'));
  r = await A.post(page.url.pathname, form, {
    description: "Taxi with receipt", amount: "25", currency: "USD", paid_by: ids.Alice, category: "transport", expense_date: daysAgo(1),
    notes: "", repeat_interval: "none", split_type: "equal", [`include_${ids.Alice}`]: "on", [`include_${ids.Bob}`]: "on", remove_receipt: "on",
  });
  check("receipt removed", r.url.pathname === receiptExpense && !r.html.includes("Receipt for"));
  // The CDN may keep serving a cached copy of an old signed URL, so check storage itself.
  const sb = createClient(SB_URL, SB_KEY, { auth: { persistSession: false } });
  await sb.auth.signInWithPassword({ email: email("alice"), password: "testpass123" });
  const { data: left } = await sb.storage.from("receipts").list(`${gid}/${receiptExpense.split("/").pop()}`);
  check("removed receipt file is deleted from storage", (left ?? []).length === 0, JSON.stringify(left));
});

await step("comments", async () => {
  r = await B.submit(receiptExpense, "body", { body: "Thanks for grabbing this! 🙏" });
  check("Bob comments", r.text.includes("Thanks for grabbing this! 🙏"));
  r = await A.get(receiptExpense);
  const deleteButtons = (r.html.match(/>\s*Delete\s*<\/button>/g) ?? []).length;
  check("Alice sees comment but no delete for Bob's comment", r.text.includes("Thanks for grabbing this!") && deleteButtons === 1, `delete buttons: ${deleteButtons}`);
  r = await A.get(g);
  check("comment count badge", r.text.includes("💬1"));
  r = await B.submit(receiptExpense, "body", { body: "   " });
  check("empty comment rejected", r.html.includes("Write a comment first."));
  const page = await B.get(receiptExpense);
  const forms = B.forms(page.html).filter((f) => />\s*Delete\s*<\/button>/.test(f));
  r = await B.post(page.url.pathname, forms[forms.length - 1], {});
  check("Bob deletes own comment", !r.text.includes("Thanks for grabbing this!"));
  r = await A.get(`${g}/activity`);
  check("activity shows comment", r.text.includes("commented on “Taxi with receipt”"));
});

await step("search, filters, CSV", async () => {
  r = await A.get(`${g}?q=pizza`);
  const results = r.text.slice(r.text.indexOf("result"));
  check("search finds Pizza night only", results.includes("Pizza night") && !results.includes("Groceries") && r.text.includes("1 result"));
  r = await A.get(`${g}?category=housing`);
  check("category filter", r.text.includes("Rent") && !r.text.includes("Pizza night"));
  r = await A.get(`${g}?from=${daysAgo(2)}`);
  check("date filter hides old rent", !r.text.includes("Rent🔁") || (r.text.match(/Rent🔁/g) ?? []).length < 3);
  r = await A.get(`${g}?q=zzzz`);
  check("no matches message", r.text.includes("Nothing matches these filters."));
  const csv = await A.request(`${g}/export`);
  const lines = csv.html.replace(/^﻿/, "").trim().split("\r\n");
  check("CSV export downloads", lines[0].startsWith("Date,Type,Description,Category,Currency,Amount,Paid by,Split,Notes,Alice,Bob"), lines[0]);
  check("CSV has every expense", lines.length - 1 >= 6, String(lines.length));
  check("CSV row math: Pizza night Alice +12 (paid 60, share 48), Bob -12", lines.some((l) => l.includes("Pizza night") && l.endsWith(",12.00,-12.00")), lines.find((l) => l.includes("Pizza night")));
  const filtered = await A.request(`${g}/export?q=pizza`);
  check("CSV honors filters", filtered.html.trim().split("\r\n").length === 2);
  const outsider = await C.request(`${g}/export`);
  check("outsider can't export", outsider.status === 404);
});

await step("currency conversion", async () => {
  await addExpense(B, { description: "Paris lunch", amount: "40", currency: "EUR", paid_by: ids.Bob, category: "food", split_type: "equal", [`include_${ids.Alice}`]: "on", [`include_${ids.Bob}`]: "on" });
  r = await A.get(g);
  check("toggle offered with multiple currencies", r.text.includes("All in USD"));
  r = await A.get(`${g}?view=converted`);
  const rates = await (await fetch("https://open.er-api.com/v6/latest/USD")).json();
  // Alice: USD net + (-20 EUR) converted
  const usd = /You are owed ≈ \$([\d,]+\.\d\d)|You owe ≈ \$([\d,]+\.\d\d)/.exec(r.text);
  check("converted balance shown with ≈ and attribution", Boolean(usd) && r.text.includes("Rates by Exchange Rate API"), r.text.slice(0, 500));
  const byCur = await A.get(g);
  const usdOwed = Number(/You are owed \$([\d,]+\.\d\d)/.exec(byCur.text)?.[1].replace(/,/g, ""));
  const eurOwe = Number(/You owe €([\d,]+\.\d\d)/.exec(byCur.text)?.[1].replace(/,/g, ""));
  const expected = usdOwed - eurOwe / rates.rates.EUR;
  const shown = Number((usd[1] ?? usd[2]).replace(/,/g, "")) * (usd[1] ? 1 : -1);
  check("converted amount matches today's rate", Math.abs(shown - expected) <= 0.02, `shown ${shown} expected ${expected.toFixed(2)}`);
  r = await A.get("/");
  check("dashboard overall total in default currency", r.text.includes("Overall:") && r.text.includes("Converted to USD"));
});

await step("charts", async () => {
  r = await A.get(`${g}/stats`);
  check("charts page renders", r.text.includes("Spending by category") && r.text.includes("Spending by month") && r.text.includes("Who paid vs. who owes"));
  check("categories present", r.text.includes("Rent & housing") && r.text.includes("Food & drink"));
  check("table view present", r.text.includes("Show as table"));
  r = await A.get(`${g}/stats?range=30d`);
  check("30-day range excludes old rent", r.text.includes("30 days") && !/Rent &amp; housing|Rent & housing: \$3,000/.test(r.text));
  check("outsider can't see charts", isNotFound(await C.get(`${g}/stats`)));
});

await step("email reminder", async () => {
  r = await A.get(g);
  const mailto = /href="(mailto:[^"]+)"/.exec(r.html)?.[1];
  check("Remind button emails the debtor", Boolean(mailto) && decodeURIComponent(mailto).includes(email("bob")) && decodeURIComponent(mailto).includes("friendly reminder"), mailto?.slice(0, 120));
});

await step("live updates (Supabase Realtime)", async () => {
  const listen = async (who, label) => {
    const sb = createClient(SB_URL, SB_KEY, { auth: { persistSession: false } });
    const { error } = await sb.auth.signInWithPassword({ email: email(who), password: "testpass123" });
    if (error) throw new Error(error.message);
    await sb.realtime.setAuth((await sb.auth.getSession()).data.session.access_token);
    const events = [];
    // Wait for the server's "Subscribed to PostgreSQL" confirmation, which arrives after SUBSCRIBED.
    let ready;
    const pgReady = new Promise((res) => (ready = res));
    const ch = sb.channel(`t-${label}`)
      .on("system", {}, (p) => p.extension === "postgres_changes" && p.status === "ok" && ready())
      .on("postgres_changes", { event: "*", schema: "public", table: "expenses", filter: `group_id=eq.${gid}` }, (p) => events.push(p));
    await new Promise((res, rej) => { ch.subscribe((s) => (s === "SUBSCRIBED" ? res() : s === "CHANNEL_ERROR" || s === "TIMED_OUT" ? rej(new Error(s)) : null)); setTimeout(() => rej(new Error("subscribe timeout")), 15000); });
    await Promise.race([pgReady, new Promise((x) => setTimeout(x, 10000))]);
    return { sb, events };
  };
  const alice = await listen("alice", "a");
  const carol = await listen("carol", "c");
  await addExpense(B, { description: "Live coffee", amount: "4", currency: "USD", paid_by: ids.Bob, split_type: "equal", [`include_${ids.Alice}`]: "on", [`include_${ids.Bob}`]: "on" });
  for (let i = 0; i < 20 && !alice.events.some((e) => e.new?.description === "Live coffee"); i++) await new Promise((x) => setTimeout(x, 500));
  check("member receives the change live", alice.events.some((e) => e.eventType === "INSERT" && e.new?.description === "Live coffee"), `${alice.events.length} events`);
  check("non-member receives nothing", carol.events.length === 0, `${carol.events.length} events`);
  await alice.sb.removeAllChannels();
  await carol.sb.removeAllChannels();
  r = await A.get(g);
  check("page includes live indicator", r.text.includes("Connecting…") || r.text.includes("Live"));
});

console.log(failureCount() ? `\n${failureCount()} FAILURES` : "\nALL PASS");
process.exit(0);
