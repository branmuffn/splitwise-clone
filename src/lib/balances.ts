// Balances and settle-up suggestions, computed separately for each currency.
// All amounts are integers in the currency's minor unit.

export type ExpenseInput = {
  amount_cents: number;
  currency: string;
  paid_by: string;
  splits: { user_id: string; share_cents: number }[];
};
export type PaymentInput = { from_user: string; to_user: string; amount_cents: number; currency: string };
export type Transfer = { from: string; to: string; cents: number; currency: string };
// currency -> user id -> net (positive = is owed money, negative = owes money)
export type Balances = Map<string, Map<string, number>>;

function bump(m: Balances, currency: string, user: string, delta: number) {
  if (!m.has(currency)) m.set(currency, new Map());
  const inner = m.get(currency)!;
  inner.set(user, (inner.get(user) ?? 0) + delta);
}

export function computeBalances(expenses: ExpenseInput[], payments: PaymentInput[]): Balances {
  const b: Balances = new Map();
  for (const e of expenses) {
    bump(b, e.currency, e.paid_by, e.amount_cents);
    for (const s of e.splits) bump(b, e.currency, s.user_id, -s.share_cents);
  }
  // Paying someone reduces what you owe them.
  for (const p of payments) {
    bump(b, p.currency, p.from_user, p.amount_cents);
    bump(b, p.currency, p.to_user, -p.amount_cents);
  }
  // Drop currencies where everyone is at zero.
  for (const [cur, inner] of b) if ([...inner.values()].every((v) => v === 0)) b.delete(cur);
  return b;
}

// The current user's net per currency (non-zero only).
export function netFor(b: Balances, userId: string): { currency: string; cents: number }[] {
  return [...b]
    .map(([currency, inner]) => ({ currency, cents: inner.get(userId) ?? 0 }))
    .filter((x) => x.cents !== 0);
}

// "Simplify debts" on: settle net balances with as few transfers as possible
// (greedy, after first pairing up people whose amounts match exactly).
export function simplifiedTransfers(b: Balances): Transfer[] {
  const out: Transfer[] = [];
  for (const [currency, inner] of [...b].sort(([a], [z]) => a.localeCompare(z))) {
    const debtors = [...inner].filter(([, c]) => c < 0).map(([id, c]) => ({ id, left: -c }));
    const creditors = [...inner].filter(([, c]) => c > 0).map(([id, c]) => ({ id, left: c }));

    for (const d of debtors) {
      const match = creditors.find((c) => c.left === d.left && c.left > 0);
      if (match) {
        out.push({ from: d.id, to: match.id, cents: d.left, currency });
        match.left = 0;
        d.left = 0;
      }
    }

    const ds = debtors.filter((d) => d.left > 0).sort((a, z) => z.left - a.left);
    const cs = creditors.filter((c) => c.left > 0).sort((a, z) => z.left - a.left);
    let i = 0;
    let j = 0;
    while (i < ds.length && j < cs.length) {
      const cents = Math.min(ds[i].left, cs[j].left);
      out.push({ from: ds[i].id, to: cs[j].id, cents, currency });
      ds[i].left -= cents;
      cs[j].left -= cents;
      if (ds[i].left === 0) i++;
      if (cs[j].left === 0) j++;
    }
  }
  return out;
}

// "Simplify debts" off: who owes whom based on the actual expenses, netted per pair.
export function pairwiseTransfers(expenses: ExpenseInput[], payments: PaymentInput[]): Transfer[] {
  // key "currency|a|b" with a < b; positive = a owes b
  const pairs = new Map<string, number>();
  const add = (currency: string, debtor: string, creditor: string, cents: number) => {
    if (debtor === creditor || cents === 0) return;
    const [a, z, sign] = debtor < creditor ? [debtor, creditor, 1] : [creditor, debtor, -1];
    const key = `${currency}|${a}|${z}`;
    pairs.set(key, (pairs.get(key) ?? 0) + sign * cents);
  };
  for (const e of expenses) for (const s of e.splits) add(e.currency, s.user_id, e.paid_by, s.share_cents);
  // A payment from X to Y means Y now owes X that amount back.
  for (const p of payments) add(p.currency, p.to_user, p.from_user, p.amount_cents);

  const out: Transfer[] = [];
  for (const [key, cents] of pairs) {
    if (cents === 0) continue;
    const [currency, a, z] = key.split("|");
    out.push(cents > 0 ? { from: a, to: z, cents, currency } : { from: z, to: a, cents: -cents, currency });
  }
  return out.sort((x, y) => x.currency.localeCompare(y.currency) || y.cents - x.cents);
}
