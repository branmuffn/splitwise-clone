// Friends view (Brian picked F1, 2026-11-15): everyone you share a group with, and what you and they owe each other
// across all groups. Per group it uses the same settle-up suggestions the group page shows (simplified or pairwise, per
// the group's setting), so the numbers always match what Remind and Record act on.
import {
  computeBalances,
  pairwiseTransfers,
  simplifiedTransfers,
  type ExpenseInput,
  type PaymentInput,
} from "./balances.ts";
import { allocate } from "./splits.ts";

export type FriendMember = { id: string; name: string; email: string; standin: boolean };
export type FriendGroupInput = {
  id: string;
  name: string;
  simplify: boolean;
  joinCode: string;
  members: FriendMember[];
  expenses: ExpenseInput[];
  payments: PaymentInput[];
};
// Positive cents = the friend owes you; negative = you owe the friend.
export type Line = { currency: string; cents: number };
export type FriendGroup = { groupId: string; groupName: string; joinCode: string; memberCount: number; lines: Line[] };
export type Friend = FriendMember & { groups: FriendGroup[]; totals: Line[] };

// `first` (the user's default currency) is listed first, then the rest alphabetically.
function toLines(m: Map<string, number>, first?: string): Line[] {
  return [...m]
    .filter(([, cents]) => cents !== 0)
    .map(([currency, cents]) => ({ currency, cents }))
    .sort((a, z) => Number(z.currency === first) - Number(a.currency === first) || a.currency.localeCompare(z.currency));
}

export function friendBalances(me: string, groups: FriendGroupInput[], first?: string): Friend[] {
  const friends = new Map<string, Friend>();
  for (const g of groups) {
    // Expenses saved by the old app have no splits: equal among current members (same as the group page).
    const ids = g.members.map((m) => m.id);
    const expenses = g.expenses.map((e) =>
      e.splits.length > 0
        ? e
        : { ...e, splits: allocate(e.amount_cents, ids.map(() => 1)).map((share_cents, i) => ({ user_id: ids[i], share_cents })) },
    );
    const transfers = g.simplify
      ? simplifiedTransfers(computeBalances(expenses, g.payments))
      : pairwiseTransfers(expenses, g.payments);

    const owed = new Map<string, Map<string, number>>(); // friend -> currency -> cents
    for (const t of transfers) {
      if (t.from !== me && t.to !== me) continue;
      const other = t.from === me ? t.to : t.from;
      const signed = t.to === me ? t.cents : -t.cents;
      if (!owed.has(other)) owed.set(other, new Map());
      const m = owed.get(other)!;
      m.set(t.currency, (m.get(t.currency) ?? 0) + signed);
    }

    for (const member of g.members) {
      if (member.id === me) continue;
      const f = friends.get(member.id) ?? { ...member, groups: [], totals: [] };
      f.groups.push({
        groupId: g.id,
        groupName: g.name,
        joinCode: g.joinCode,
        memberCount: g.members.length,
        lines: toLines(owed.get(member.id) ?? new Map(), first),
      });
      friends.set(member.id, f);
    }
  }

  for (const f of friends.values()) {
    const sum = new Map<string, number>();
    for (const g of f.groups) for (const l of g.lines) sum.set(l.currency, (sum.get(l.currency) ?? 0) + l.cents);
    f.totals = toLines(sum, first);
    // Groups with something owed first, then by name.
    f.groups.sort((a, z) => Number(z.lines.length > 0) - Number(a.lines.length > 0) || a.groupName.localeCompare(z.groupName));
  }
  // Friends with a balance first, then by name.
  return [...friends.values()].sort(
    (a, z) => Number(z.totals.length > 0) - Number(a.totals.length > 0) || a.name.localeCompare(z.name),
  );
}
