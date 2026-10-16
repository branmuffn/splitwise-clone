// Net balances and a simple greedy settle-up. All values are integer cents.

export type ExpenseInput = { amount_cents: number; paid_by: string };
export type Transfer = { from: string; to: string; cents: number };

// Positive = the member is owed money; negative = the member owes money.
// Each expense is split equally among all members. Leftover cents (e.g. $10 / 3)
// go one each to the first members in `memberIds` order, so totals always sum to zero.
export function computeBalances(memberIds: string[], expenses: ExpenseInput[]): Map<string, number> {
  const balances = new Map(memberIds.map((id) => [id, 0]));
  const n = memberIds.length;
  if (n === 0) return balances;

  for (const { amount_cents, paid_by } of expenses) {
    const share = Math.floor(amount_cents / n);
    const remainder = amount_cents - share * n;
    memberIds.forEach((id, i) => {
      balances.set(id, balances.get(id)! - share - (i < remainder ? 1 : 0));
    });
    balances.set(paid_by, (balances.get(paid_by) ?? 0) + amount_cents);
  }
  return balances;
}

// Greedy: repeatedly match the biggest debtor with the biggest creditor.
// Not Splitwise's full debt simplification, but at most (members - 1) transfers.
export function settleUp(balances: Map<string, number>): Transfer[] {
  const debtors = [...balances].filter(([, c]) => c < 0).map(([id, c]) => ({ id, left: -c }));
  const creditors = [...balances].filter(([, c]) => c > 0).map(([id, c]) => ({ id, left: c }));
  debtors.sort((a, b) => b.left - a.left);
  creditors.sort((a, b) => b.left - a.left);

  const transfers: Transfer[] = [];
  let d = 0;
  let c = 0;
  while (d < debtors.length && c < creditors.length) {
    const cents = Math.min(debtors[d].left, creditors[c].left);
    transfers.push({ from: debtors[d].id, to: creditors[c].id, cents });
    debtors[d].left -= cents;
    creditors[c].left -= cents;
    if (debtors[d].left === 0) d++;
    if (creditors[c].left === 0) c++;
  }
  return transfers;
}
