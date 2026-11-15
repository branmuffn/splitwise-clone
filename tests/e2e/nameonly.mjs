// "Start now" (Brian picked N1, 2026-11-15): name-only accounts, invite links, adding an email later.
// Test accounts are named "E2E ..." (name-only) or claude-e2e-...@example.com; the nightly cleanup removes them after a day.
import { Browser, check, email, failureCount, linkTo, memberIds, run, step } from "./helpers.mjs";

const N = new Browser("Nina"), O = new Browser("Omar"), P = new Browser("Pat");
const nina = `E2E Nina ${run}`, omar = `E2E Omar ${run}`;
let r, g, code, link;

await step("sign-in page leads with Start now", async () => {
  r = await new Browser("x").get("/login");
  check("Start now link", linkTo(r.html, "Start now") === "/start");
  check("demo still offered", r.html.includes("Try the demo"));
  check("email sign-in still on the page", r.html.includes('name="password"') && r.html.includes('href="/forgot-password"'));
  r = await new Browser("x").get("/start");
  check("start page is public", r.url.pathname === "/start" && r.text.includes("What should friends call you?"));
});

await step("start with just a name", async () => {
  r = await N.submit("/start", "name", { name: "   " });
  check("empty name rejected", r.text.includes("Please enter your name."));
  r = await N.submit("/start", "name", { name: `  ${nina}  ` });
  check("lands on home, signed in", r.url.pathname === "/" && r.text.includes(`Hi, ${nina}`), r.url.href);
  check("reminder to add an email", r.text.includes("Keep your account safe.") && r.html.includes('href="/profile#add-email"'));
  r = await N.get("/start");
  check("signed-in user skips /start", r.url.pathname === "/");
});

await step("create a group and get its invite link", async () => {
  r = await N.submit("/", "name", { name: `Cabin ${run}`, currency: "USD" });
  g = r.url.pathname;
  code = /tracking-\[0\.3em\][^>]*>([A-Z0-9]{6})/.exec(r.html)?.[1];
  link = /data-invite-url="([^"]+)"/.exec(r.html)?.[1];
  check("group page has Copy invite link", r.text.includes("Copy invite link") && Boolean(link) && link.endsWith(`/join/${code}`), link);
});

await step("a friend joins from the link with a name", async () => {
  const path = new URL(link).pathname;
  r = await O.get(path);
  check("invite page is public and shows the group", r.url.pathname === path && r.text.includes(`Cabin ${run}`) && r.text.includes("1 member"), r.text.slice(0, 300));
  r = await O.submit(path, "name", { name: omar });
  check("joined and landed in the group", r.url.pathname === g && r.text.includes("You joined the group") && r.text.includes("2 members"), r.url.href);
  r = await O.get(path);
  check("opening the link again says already in", r.text.includes(`You're already in Cabin ${run}`));
  r = await new Browser("x").get(path.toLowerCase());
  check("lowercase code works too", r.text.includes(`Cabin ${run}`));
  r = await new Browser("x").get("/join/ZZZZZ9");
  check("unknown code explains itself", r.text.includes("This invite link doesn't work"));
});

await step("email account joins from the link by signing in", async () => {
  const path = new URL(link).pathname;
  await P.submit("/signup", "email", { name: "E2E Pat", email: email("pat"), password: "testpass123" });
  const fresh = new Browser("Pat2");
  r = await fresh.submit(path, "password", { email: email("pat"), password: "testpass123" });
  check("signed in and joined", r.url.pathname === g && r.text.includes("3 members"), r.url.href);
});

await step("no Remind for name-only friends", async () => {
  const page = await O.get(`${g}/expenses/new`);
  const ids = memberIds(page.html);
  const form = O.forms(page.html).find((f) => f.includes('name="description"'));
  r = await O.post(page.url.pathname, form, {
    description: "Firewood", amount: "30", currency: "USD", paid_by: ids[omar], category: "general", expense_date: "2026-11-15", notes: "",
    split_type: "equal", [`include_${ids[omar]}`]: "on", [`include_${ids[nina]}`]: "on",
  });
  r = await O.get(g);
  check("Nina owes Omar", r.text.includes(`${nina} owes you $15.00`), r.text.slice(r.text.indexOf("Who owes"), r.text.indexOf("Who owes") + 200));
  check("no Remind button (Nina has no email)", !/>\s*Remind\s*</.test(r.html));
  r = await O.get(`${g}/settings`);
  check("settings say name only", r.text.includes("no email (name only)"));
});

await step("sign out warns a name-only account", async () => {
  r = await N.get("/");
  check("header Sign out goes to the warning", r.html.includes('href="/profile?signout=1#signout"'));
  r = await N.get("/profile?signout=1");
  check("warning shown", r.text.includes("Sign out of a name-only account?") && r.text.includes("Sign out anyway"));
});

await step("add an email later and keep everything", async () => {
  r = await N.submit("/profile", "email", { email: "not-an-email", password: "testpass123" });
  check("bad email rejected", r.text.includes("Please enter a valid email."));
  r = await N.submit("/profile", "email", { email: email("nina"), password: "testpass123" });
  check("email added", r.url.pathname === "/profile" && r.text.includes("Email added."), r.text.slice(0, 300));
  r = await N.get("/");
  check("reminder gone", !r.text.includes("Keep your account safe."));
  const N2 = new Browser("Nina2");
  r = await N2.submit("/login", "password", { email: email("nina"), password: "testpass123" });
  check("signs in with the new email on another device", r.url.pathname === "/" && r.text.includes(`Hi, ${nina}`));
  r = await N2.get(g);
  check("still in the group", r.text.includes(`Cabin ${run}`) && r.text.includes("3 members"));
  r = await O.get(g);
  check("Remind appears now that Nina has an email", />\s*Remind\s*</.test(r.html));
});

console.log(failureCount() ? `\n${failureCount()} FAILURES` : "\nALL PASS");
process.exit(failureCount() ? 1 : 0);
