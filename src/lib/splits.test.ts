import { test } from "node:test";
import assert from "node:assert/strict";
import { allocate, computeSplit } from "./splits.ts";

const ids = ["a", "b", "c"];
const none = {};
const shares = (r: ReturnType<typeof computeSplit>) => (r.ok ? Object.fromEntries(r.shares.map((s) => [s.user_id, s.share_cents])) : r.error);

test("allocate sums exactly and is deterministic", () => {
  assert.deepEqual(allocate(1000, [1, 1, 1]), [334, 333, 333]);
  assert.deepEqual(allocate(100, [1, 0, 1]), [50, 0, 50]);
  assert.deepEqual(allocate(1, [1, 1]), [1, 0]);
  for (let i = 0; i < 500; i++) {
    const amount = 1 + Math.floor(Math.random() * 1_000_000);
    const w = Array.from({ length: 1 + Math.floor(Math.random() * 8) }, () => Math.floor(Math.random() * 5000));
    if (!w.some(Boolean)) continue;
    const r = allocate(amount, w);
    assert.equal(r.reduce((x, y) => x + y, 0), amount);
    r.forEach((v, k) => w[k] === 0 && assert.equal(v, 0));
  }
});

test("equal split among a subset", () => {
  assert.deepEqual(shares(computeSplit("equal", 1000, "USD", ids, new Set(["a", "c"]), none)), { a: 500, c: 500 });
  assert.deepEqual(shares(computeSplit("equal", 1000, "USD", ids, new Set(ids), none)), { a: 334, b: 333, c: 333 });
  assert.equal(shares(computeSplit("equal", 1000, "USD", ids, new Set(), none)), "Choose at least one person.");
});

test("exact amounts must add up", () => {
  assert.deepEqual(shares(computeSplit("exact", 5000, "USD", ids, new Set(), { a: "20", b: "30", c: "" })), { a: 2000, b: 3000 });
  assert.equal(shares(computeSplit("exact", 5000, "USD", ids, new Set(), { a: "20", b: "20" })), "$10.00 left to assign.");
  assert.equal(shares(computeSplit("exact", 5000, "USD", ids, new Set(), { a: "40", b: "20" })), "$10.00 over the total.");
  assert.equal(shares(computeSplit("exact", 5000, "USD", ids, new Set(), { a: "abc" })), "“abc” isn't a valid amount.");
  assert.deepEqual(shares(computeSplit("exact", 3000, "JPY", ids, new Set(), { a: "1000", b: "2000" })), { a: 1000, b: 2000 });
});

test("percentages must total 100", () => {
  assert.deepEqual(shares(computeSplit("percent", 10000, "USD", ids, new Set(), { a: "50", b: "25", c: "25" })), { a: 5000, b: 2500, c: 2500 });
  assert.deepEqual(shares(computeSplit("percent", 100, "USD", ids, new Set(), { a: "33.33", b: "33.33", c: "33.34" })), { a: 33, b: 33, c: 34 });
  assert.equal(shares(computeSplit("percent", 100, "USD", ids, new Set(), { a: "50", b: "40" })), "Percentages add up to 90%, not 100%.");
});

test("shares are proportional", () => {
  assert.deepEqual(shares(computeSplit("shares", 9000, "USD", ids, new Set(), { a: "2", b: "1", c: "0" })), { a: 6000, b: 3000 });
  assert.deepEqual(shares(computeSplit("shares", 1000, "USD", ids, new Set(), { a: "1.5", b: "1", c: "1" })), { a: 428, b: 286, c: 286 });
  assert.equal(shares(computeSplit("shares", 1000, "USD", ids, new Set(), { a: "0" })), "Give at least one person a share.");
});

test("needs a positive amount", () => {
  assert.equal(shares(computeSplit("equal", 0, "USD", ids, new Set(ids), none)), "Enter the total amount first.");
});
