// One-click demo accounts for reviewers (Demo Day request).
//
// Each click creates a brand-new private sandbox: the reviewer's own account plus two sample
// "friends", two groups, and a spread of expenses that shows off every split type, a second
// currency, a payment, a comment, and recurring bills. Nothing is shared between reviewers, so
// anyone can edit or delete freely. It uses ordinary sign-ups (Supabase "Confirm email" must be
// off) and needs no service key. Demo accounts are `demo-…@example.com`; clean them up with the
// SQL in RESUME.md.
import { createClient as createPlainClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { computeItemized, computeSplit, type ItemizedInput, type SplitType } from "@/lib/splits";

type Client = SupabaseClient<Database>;

export const DEMO_EMAIL_PATTERN = /^demo-[a-z0-9-]+@example\.com$/;

export function isDemoEmail(email: string) {
  return DEMO_EMAIL_PATTERN.test(email);
}

function randomId() {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

function randomPassword() {
  return crypto.randomUUID() + crypto.randomUUID();
}

function daysAgo(n: number) {
  return new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
}

// Same day-of-month, `months` back (clamped to the 28th so it always exists).
function monthsAgo(months: number) {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - months, Math.min(d.getUTCDate(), 28))).toISOString().slice(0, 10);
}

// A sign-up on a throwaway client (no cookies), used for the sample friends.
async function signUpFriend(name: string): Promise<{ client: Client; id: string }> {
  const client = createPlainClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signUp({
    email: `demo-friend-${randomId()}@example.com`,
    password: randomPassword(),
    options: { data: { display_name: name } },
  });
  if (error || !data.session || !data.user) throw new Error(error?.message ?? "Sign-up needs email confirmation turned off");
  return { client, id: data.user.id };
}

type ExpenseSeed = {
  description: string;
  amount: number;
  currency?: string;
  paidBy: string;
  category: string;
  date: string;
  type: SplitType;
  included?: string[];
  values?: Record<string, string>;
  itemized?: ItemizedInput;
  repeat?: "none" | "monthly";
  notes?: string;
};

async function addExpense(client: Client, groupId: string, memberIds: string[], e: ExpenseSeed): Promise<string> {
  const currency = e.currency ?? "USD";
  let amount = e.amount;
  let shares;
  if (e.type === "itemized") {
    const r = computeItemized(e.itemized!, memberIds);
    if (!r.ok) throw new Error(r.error);
    amount = r.total;
    shares = r.shares;
  } else {
    const r = computeSplit(e.type, amount, currency, memberIds, new Set(e.included ?? memberIds), e.values ?? {});
    if (!r.ok) throw new Error(r.error);
    shares = r.shares;
  }
  const { data, error } = await client.rpc("save_expense", {
    p_expense_id: null,
    p_group_id: groupId,
    p_description: e.description,
    p_amount_cents: amount,
    p_currency: currency,
    p_paid_by: e.paidBy,
    p_category: e.category,
    p_notes: e.notes ?? null,
    p_expense_date: e.date,
    p_split_type: e.type,
    p_splits: shares,
    p_split_details: e.type === "itemized" ? e.itemized! : e.values ? { values: e.values } : null,
    p_repeat_interval: e.repeat ?? "none",
  });
  if (error) throw new Error(error.message);
  return data;
}

async function createGroup(client: Client, name: string): Promise<{ id: string; code: string }> {
  const { data: id, error } = await client.rpc("create_group", { group_name: name, group_currency: "USD" });
  if (error) throw new Error(error.message);
  const { data } = await client.from("groups").select("join_code").eq("id", id).single();
  return { id, code: data!.join_code };
}

async function join(client: Client, code: string) {
  const { error } = await client.rpc("join_group", { code });
  if (error) throw new Error(error.message);
}

// Signs the reviewer up on `me` (the cookie-backed server client, so they end up logged in)
// and fills their sandbox. Throws if sign-up isn't possible.
export async function createDemoAccount(me: Client) {
  const [{ data, error }, sam, riley] = await Promise.all([
    me.auth.signUp({
      email: `demo-${randomId()}@example.com`,
      password: randomPassword(),
      options: { data: { display_name: "Alex (demo)" } },
    }),
    signUpFriend("Sam"),
    signUpFriend("Riley"),
  ]);
  if (error || !data.session || !data.user) throw new Error(error?.message ?? "Sign-up needs email confirmation turned off");
  const alex = data.user.id;

  const [trip, flat] = await Promise.all([createGroup(me, "Beach trip 🏖️"), createGroup(me, "Apartment 🏠")]);
  await Promise.all([join(sam.client, trip.code), join(riley.client, trip.code), join(sam.client, flat.code)]);

  const tripMembers = [alex, sam.id, riley.id];
  const flatMembers = [alex, sam.id];

  const [houseId] = await Promise.all([
    addExpense(me, trip.id, tripMembers, {
      description: "Beach house rental", amount: 90000, paidBy: alex, category: "travel", date: daysAgo(10), type: "equal",
      notes: "3 nights, ocean view",
    }),
    addExpense(sam.client, trip.id, tripMembers, {
      description: "Groceries", amount: 0, paidBy: sam.id, category: "groceries", date: daysAgo(9), type: "itemized",
      itemized: {
        items: [
          { name: "Snacks", price_cents: 2400, user_ids: tripMembers },
          { name: "Wine", price_cents: 3600, user_ids: [alex, riley.id] },
          { name: "Sunscreen", price_cents: 1200, user_ids: [alex] },
        ],
        tax_cents: 576,
        tip_cents: 0,
      },
    }),
    addExpense(riley.client, trip.id, tripMembers, {
      description: "Kayak rental", amount: 12000, paidBy: riley.id, category: "entertainment", date: daysAgo(8), type: "shares",
      values: { [alex]: "1", [sam.id]: "2", [riley.id]: "1" }, notes: "Sam took the double kayak",
    }),
    addExpense(me, trip.id, tripMembers, {
      description: "Dinner in Lisbon", amount: 9600, currency: "EUR", paidBy: alex, category: "food", date: daysAgo(7), type: "percent",
      values: { [alex]: "40", [sam.id]: "30", [riley.id]: "30" },
    }),
    addExpense(sam.client, trip.id, tripMembers, {
      description: "Gas", amount: 6000, paidBy: sam.id, category: "transport", date: daysAgo(6), type: "exact",
      values: { [alex]: "30", [riley.id]: "30" }, notes: "Sam drove, so Sam doesn't pay for gas",
    }),
    addExpense(me, flat.id, flatMembers, {
      description: "Rent", amount: 240000, paidBy: alex, category: "housing", date: monthsAgo(2), type: "equal", repeat: "monthly",
    }),
    addExpense(sam.client, flat.id, flatMembers, {
      description: "Internet", amount: 6000, paidBy: sam.id, category: "utilities", date: monthsAgo(1), type: "equal", repeat: "monthly",
    }),
  ]);

  await Promise.all([
    riley.client.from("payments").insert({
      group_id: trip.id, from_user: riley.id, to_user: alex, amount_cents: 10000, currency: "USD", note: "Venmo", paid_on: daysAgo(3),
    }),
    sam.client.from("expense_comments").insert({ expense_id: houseId, group_id: trip.id, body: "Booked! Check-in is at 4pm 🏖️" }),
    // Create the recurring copies now so the apartment looks lived-in on first view.
    me.rpc("materialize_recurring", { gid: flat.id }),
  ]);

  return { tripId: trip.id };
}
