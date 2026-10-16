import { test } from "node:test";
import assert from "node:assert/strict";
import { convertBalances, convertMinor } from "./convert.ts";

const rates = { USD: 1, EUR: 0.9, JPY: 150, GBP: 0.75 };

test("convertMinor handles decimals per currency", () => {
  assert.equal(convertMinor(1000, "USD", "USD", rates), 1000);
  assert.equal(convertMinor(1000, "USD", "EUR", rates), 900);
  assert.equal(convertMinor(900, "EUR", "USD", rates), 1000);
  assert.equal(convertMinor(1000, "USD", "JPY", rates), 1500); // $10 -> ¥1,500
  assert.equal(convertMinor(1500, "JPY", "USD", rates), 1000);
  assert.equal(convertMinor(100, "XXX", "USD", rates), null);
});

test("convertBalances sums to zero and reports missing rates", () => {
  const b = new Map([
    ["USD", new Map([["a", 1001], ["b", -1001]])],
    ["EUR", new Map([["a", -333], ["b", 167], ["c", 166]])],
    ["XXX", new Map([["a", 5], ["b", -5]])],
  ]);
  const { net, missing } = convertBalances(b, "GBP", rates);
  assert.deepEqual(missing, ["XXX"]);
  assert.equal([...net.values()].reduce((x, y) => x + y, 0), 0);
  assert.equal(net.get("c"), 138); // €1.66 -> £1.383 rounded
});
