// Turns a split choice (equal / exact / percent / shares) into exact per-person shares
// in minor units that always add up to the expense amount. Used by both the form
// preview (client) and the server action (authoritative).
import { formatMoney, parseAmount } from "./money.ts";

export type SplitType = "equal" | "exact" | "percent" | "shares" | "itemized";
export const SPLIT_TYPES: { value: SplitType; label: string }[] = [
  { value: "equal", label: "Equally" },
  { value: "exact", label: "Exact" },
  { value: "percent", label: "Percent" },
  { value: "shares", label: "Shares" },
  { value: "itemized", label: "Itemized" },
];

export type Share = { user_id: string; share_cents: number };
export type SplitResult = { ok: true; shares: Share[] } | { ok: false; error: string };

// Split `amount` in proportion to integer weights. Leftover units go to the largest
// fractional remainders, ties broken by member order, so results are deterministic.
export function allocate(amount: number, weights: number[]): number[] {
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return weights.map(() => 0);
  const exact = weights.map((w) => (amount * w) / total);
  const base = exact.map(Math.floor);
  let leftover = amount - base.reduce((a, b) => a + b, 0);
  const order = exact
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (leftover <= 0) break;
    if (weights[i] > 0) {
      base[i]++;
      leftover--;
    }
  }
  return base;
}

// Parse a non-negative decimal with up to 2 places into hundredths ("33.33" -> 3333).
function hundredths(input: string): number | null {
  const m = /^(\d{1,6})(?:\.(\d{0,2}))?$/.exec(input.trim());
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
}

export function computeSplit(
  type: SplitType,
  amount: number,
  currency: string,
  memberIds: string[],
  // equal: ids included; other types: raw input per member ("" = 0)
  included: Set<string>,
  values: Record<string, string>,
): SplitResult {
  if (!(amount > 0)) return { ok: false, error: "Enter the total amount first." };

  let shares: number[];
  if (type === "equal") {
    const weights = memberIds.map((id) => (included.has(id) ? 1 : 0));
    if (!weights.some(Boolean)) return { ok: false, error: "Choose at least one person." };
    shares = allocate(amount, weights);
  } else if (type === "exact") {
    shares = [];
    for (const id of memberIds) {
      const raw = (values[id] ?? "").trim();
      const v = raw === "" ? 0 : parseAmount(raw, currency, true);
      if (v === null) return { ok: false, error: `“${raw}” isn't a valid amount.` };
      shares.push(v);
    }
    const sum = shares.reduce((a, b) => a + b, 0);
    if (sum !== amount) {
      const diff = amount - sum;
      return {
        ok: false,
        error: diff > 0
          ? `${formatMoney(diff, currency)} left to assign.`
          : `${formatMoney(-diff, currency)} over the total.`,
      };
    }
  } else {
    const weights: number[] = [];
    for (const id of memberIds) {
      const raw = (values[id] ?? "").trim();
      const v = raw === "" ? 0 : hundredths(raw);
      if (v === null) return { ok: false, error: `“${raw}” isn't a valid ${type === "percent" ? "percentage" : "share"}.` };
      weights.push(v);
    }
    const total = weights.reduce((a, b) => a + b, 0);
    if (type === "percent" && total !== 10000) {
      return { ok: false, error: `Percentages add up to ${(total / 100).toFixed(2).replace(/\.00$/, "")}%, not 100%.` };
    }
    if (total === 0) return { ok: false, error: "Give at least one person a share." };
    shares = allocate(amount, weights);
  }

  const result = memberIds
    .map((user_id, i) => ({ user_id, share_cents: shares[i] }))
    .filter((s) => s.share_cents > 0);
  if (result.length === 0) return { ok: false, error: "Choose at least one person." };
  return { ok: true, shares: result };
}

// ---- Itemized bills ----

export type BillItem = { name: string; price_cents: number; user_ids: string[] };
export type ItemizedInput = { items: BillItem[]; tax_cents: number; tip_cents: number };
export type ItemizedResult = { ok: true; shares: Share[]; total: number } | { ok: false; error: string };

// Each item is split equally among the people who had it; tax and tip are then shared in
// proportion to each person's item subtotal (how restaurants are usually split).
export function computeItemized(input: ItemizedInput, memberIds: string[]): ItemizedResult {
  const items = input.items.filter((i) => i.name.trim() || i.price_cents > 0);
  if (items.length === 0) return { ok: false, error: "Add at least one item." };
  const subtotal = new Map(memberIds.map((id) => [id, 0]));
  for (const [n, item] of items.entries()) {
    const label = item.name.trim() || `Item ${n + 1}`;
    if (!(item.price_cents > 0)) return { ok: false, error: `Enter a price for “${label}”.` };
    const who = memberIds.filter((id) => item.user_ids.includes(id));
    if (who.length === 0) return { ok: false, error: `Choose who had “${label}”.` };
    const parts = allocate(item.price_cents, who.map(() => 1));
    who.forEach((id, k) => subtotal.set(id, subtotal.get(id)! + parts[k]));
  }
  if (input.tax_cents < 0 || input.tip_cents < 0) return { ok: false, error: "Tax and tip can't be negative." };
  const extras = allocate(input.tax_cents + input.tip_cents, memberIds.map((id) => subtotal.get(id)!));
  const shares = memberIds
    .map((user_id, i) => ({ user_id, share_cents: subtotal.get(user_id)! + extras[i] }))
    .filter((s) => s.share_cents > 0);
  const total = shares.reduce((a, s) => a + s.share_cents, 0);
  return { ok: true, shares, total };
}
