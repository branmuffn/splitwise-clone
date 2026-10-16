import { test } from "node:test";
import assert from "node:assert/strict";
import { computeBalances, netFor, pairwiseTransfers, simplifiedTransfers, type ExpenseInput, type PaymentInput } from "./balances.ts";
import { allocate } from "./splits.ts";

const equal = (amount: number, currency: string, paid_by: string, ids: string[]): ExpenseInput => ({
  amount_cents: amount, currency, paid_by,
  splits: allocate(amount, ids.map(() => 1)).map((share_cents, i) => ({ user_id: ids[i], share_cents })),
});
const obj = (b: ReturnType<typeof computeBalances>) => Object.fromEntries([...b].map(([c, m]) => [c, Object.fromEntries(m)]));

test("balances are kept per currency", () => {
  const b = computeBalances([equal(3000, "USD", "a", ["a", "b"]), equal(1000, "EUR", "b", ["a", "b"])], []);
  assert.deepEqual(obj(b), { USD: { a: 1500, b: -1500 }, EUR: { b: 500, a: -500 } });
  assert.deepEqual(netFor(b, "a"), [{ currency: "USD", cents: 1500 }, { currency: "EUR", cents: -500 }]);
  assert.deepEqual(simplifiedTransfers(b), [
    { from: "a", to: "b", cents: 500, currency: "EUR" },
    { from: "b", to: "a", cents: 1500, currency: "USD" },
  ]);
});

test("payments reduce balances; fully paid currency disappears", () => {
  const e = [equal(3000, "USD", "a", ["a", "b"])];
  const p: PaymentInput[] = [{ from_user: "b", to_user: "a", amount_cents: 1000, currency: "USD" }];
  assert.deepEqual(obj(computeBalances(e, p)), { USD: { a: 500, b: -500 } });
  p.push({ from_user: "b", to_user: "a", amount_cents: 500, currency: "USD" });
  assert.equal(computeBalances(e, p).size, 0);
  assert.deepEqual(pairwiseTransfers(e, p), []);
});

test("custom split: only listed people owe", () => {
  const e: ExpenseInput = { amount_cents: 9000, currency: "USD", paid_by: "a", splits: [{ user_id: "b", share_cents: 6000 }, { user_id: "c", share_cents: 3000 }] };
  assert.deepEqual(obj(computeBalances([e], [])), { USD: { a: 9000, b: -6000, c: -3000 } });
});

test("pairwise (simplify off) vs simplified", () => {
  // a pays 30 for a,b,c; b pays 30 for b,c,a... chain: b owes a, c owes b
  const e = [
    { amount_cents: 1000, currency: "USD", paid_by: "a", splits: [{ user_id: "b", share_cents: 1000 }] },
    { amount_cents: 1000, currency: "USD", paid_by: "b", splits: [{ user_id: "c", share_cents: 1000 }] },
  ];
  assert.deepEqual(pairwiseTransfers(e, []), [
    { from: "b", to: "a", cents: 1000, currency: "USD" },
    { from: "c", to: "b", cents: 1000, currency: "USD" },
  ]);
  // Simplified: c pays a directly, b is even.
  assert.deepEqual(simplifiedTransfers(computeBalances(e, [])), [{ from: "c", to: "a", cents: 1000, currency: "USD" }]);
});

test("simplified prefers exact matches", () => {
  const b = new Map([["USD", new Map([["a", 500], ["b", 300], ["c", -300], ["d", -500]])]]);
  assert.deepEqual(simplifiedTransfers(b), [
    { from: "c", to: "b", cents: 300, currency: "USD" },
    { from: "d", to: "a", cents: 500, currency: "USD" },
  ]);
});

test("randomized: both modes settle everyone exactly", () => {
  const ids = ["a", "b", "c", "d", "e"];
  for (let run = 0; run < 300; run++) {
    const expenses: ExpenseInput[] = [];
    const payments: PaymentInput[] = [];
    for (let k = 0; k < 10; k++) {
      const who = ids.filter(() => Math.random() < 0.6);
      if (!who.length) continue;
      expenses.push(equal(1 + Math.floor(Math.random() * 50000), Math.random() < 0.5 ? "USD" : "EUR", ids[k % 5], who));
    }
    for (let k = 0; k < 3; k++) {
      const [f, t] = [ids[k], ids[(k + 1 + run) % 5]];
      if (f !== t) payments.push({ from_user: f, to_user: t, amount_cents: 1 + Math.floor(Math.random() * 5000), currency: "USD" });
    }
    const b = computeBalances(expenses, payments);
    for (const [, inner] of b) assert.equal([...inner.values()].reduce((x, y) => x + y, 0), 0);
    for (const transfers of [simplifiedTransfers(b), pairwiseTransfers(expenses, payments)]) {
      const after = computeBalances(expenses, [...payments, ...transfers.map((t) => ({ from_user: t.from, to_user: t.to, amount_cents: t.cents, currency: t.currency }))]);
      assert.equal(after.size, 0);
      assert.ok(transfers.every((t) => t.cents > 0 && t.from !== t.to));
    }
    for (const [cur, inner] of b) {
      const nonZero = [...inner.values()].filter((v) => v !== 0).length;
      assert.ok(simplifiedTransfers(b).filter((t) => t.currency === cur).length <= Math.max(0, nonZero - 1));
    }
  }
});
