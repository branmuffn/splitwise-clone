// One-click demo login: lands signed in on a private, pre-filled sandbox.
import { Browser, check, failureCount, isNotFound, linkTo, step } from "./helpers.mjs";

async function startDemo(b) {
  const page = await b.get("/login");
  const form = b.forms(page.html).find((f) => f.includes("Try the demo"));
  if (!form) throw new Error("no demo button on /login");
  return b.post("/login", form, {});
}

const D1 = new Browser("D1"), D2 = new Browser("D2");
let r, trip;

await step("one-click demo", async () => {
  const t0 = Date.now();
  r = await startDemo(D1);
  check(`demo click lands on the sample group (${Date.now() - t0} ms)`, /^\/groups\/[0-9a-f-]{36}$/.test(r.url.pathname), r.url.href);
  trip = r.url.pathname;
  check("signup page also offers the demo", (await new Browser("x").get("/signup")).html.includes("Try the demo"));
  check("demo banner shown", r.text.includes("You're in a demo account"));
  check("sample expenses present", ["Beach house rental", "Groceries", "Kayak rental", "Dinner in Lisbon", "Gas"].every((d) => r.text.includes(d)));
  check("sample payment and comment", r.text.includes("Riley paid you $100.00") && r.text.includes("💬1"));
  // Alex: +600 house, -41.04 groceries (itemized w/ tax), -30 kayak, -30 gas, -100 Riley's payment
  check("USD balance is exactly right: owed $398.96", r.text.includes("You are owed $398.96"), r.text.slice(0, 500));
  check("EUR balance from the percent split: owed €57.60", r.text.includes("You are owed €57.60"));
  check("multi-currency toggle offered", r.text.includes("All in USD"));
});

await step("apartment with recurring bills", async () => {
  r = await D1.get("/");
  check("dashboard lists both sample groups", r.text.includes("Beach trip") && r.text.includes("Apartment"));
  const flat = linkTo(r.html, "Apartment");
  r = await D1.get(flat);
  check("rent has original + 2 monthly copies", (r.text.match(/Rent🔁/g) ?? []).length === 3, String((r.text.match(/Rent🔁/g) ?? []).length));
  check("internet has original + 1 copy", (r.text.match(/Internet🔁/g) ?? []).length === 2);
});

await step("sandboxes are isolated", async () => {
  r = await startDemo(D2);
  check("second demo gets its own group", r.url.pathname !== trip && r.url.pathname.startsWith("/groups/"));
  check("second demo can't open the first one's group", isNotFound(await D2.get(trip)));
});

await step("leaving the demo", async () => {
  const page = await D1.get(trip);
  const form = D1.forms(page.html).find((f) => f.includes("Create a real account"));
  r = await D1.post(page.url.pathname, form, {});
  check("'Create a real account' signs out to the sign-up page", r.url.pathname === "/signup");
  r = await D1.get(trip);
  check("signed-out visitor is sent to login", r.url.pathname === "/login");
});

console.log(failureCount() ? `\n${failureCount()} FAILURES` : "\nALL PASS");
