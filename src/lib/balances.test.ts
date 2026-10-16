import { test } from "node:test";
import assert from "node:assert/strict";
import { computeBalances, settleUp } from "./balances.ts";

const sum = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);

test("two people, one expense", () => {
  const b = computeBalances(["a", "b"], [{ amount_cents: 3000, paid_by: "a" }]);
  assert.deepEqual(Object.fromEntries(b), { a: 1500, b: -1500 });
  assert.deepEqual(settleUp(b), [{ from: "b", to: "a", cents: 1500 }]);
});

test("expenses that cancel out need no transfers", () => {
  const b = computeBalances(["a", "b"], [
    { amount_cents: 1000, paid_by: "a" },
    { amount_cents: 1000, paid_by: "b" },
  ]);
  assert.deepEqual(Object.fromEntries(b), { a: 0, b: 0 });
  assert.deepEqual(settleUp(b), []);
});

test("uneven division distributes leftover cents and sums to zero", () => {
  const b = computeBalances(["a", "b", "c"], [{ amount_cents: 1000, paid_by: "c" }]);
  // shares: a 334, b 333, c 333
  assert.deepEqual(Object.fromEntries(b), { a: -334, b: -333, c: 667 });
  assert.equal(sum(b), 0);
  const t = settleUp(b);
  assert.deepEqual(t, [
    { from: "a", to: "c", cents: 334 },
    { from: "b", to: "c", cents: 333 },
  ]);
});

test("member with no expenses still owes their share", () => {
  const b = computeBalances(["a", "b", "c", "d"], [
    { amount_cents: 8000, paid_by: "a" },
    { amount_cents: 4000, paid_by: "b" },
  ]);
  assert.deepEqual(Object.fromEntries(b), { a: 5000, b: 1000, c: -3000, d: -3000 });
  const t = settleUp(b);
  assert.ok(t.length <= 3);
  // Applying transfers zeroes everyone out.
  const after = new Map(b);
  for (const { from, to, cents } of t) {
    assert.ok(cents > 0);
    after.set(from, after.get(from)! + cents);
    after.set(to, after.get(to)! - cents);
  }
  assert.ok([...after.values()].every((v) => v === 0));
});

test("randomized: balances sum to zero and settle-up clears them", () => {
  for (let run = 0; run < 500; run++) {
    const ids = Array.from({ length: 1 + Math.floor(Math.random() * 7) }, (_, i) => `m${i}`);
    const expenses = Array.from({ length: Math.floor(Math.random() * 12) }, () => ({
      amount_cents: 1 + Math.floor(Math.random() * 100000),
      paid_by: ids[Math.floor(Math.random() * ids.length)],
    }));
    const b = computeBalances(ids, expenses);
    assert.equal(sum(b), 0);
    const t = settleUp(b);
    assert.ok(t.length <= Math.max(0, ids.length - 1));
    for (const { from, to, cents } of t) {
      b.set(from, b.get(from)! + cents);
      b.set(to, b.get(to)! - cents);
    }
    assert.ok([...b.values()].every((v) => v === 0));
  }
});

test("empty group", () => {
  assert.deepEqual(settleUp(computeBalances([], [])), []);
});
