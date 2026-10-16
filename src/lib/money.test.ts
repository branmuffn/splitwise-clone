import { test } from "node:test";
import assert from "node:assert/strict";
import { formatCents, parseDollarsToCents } from "./money.ts";

test("parseDollarsToCents accepts common formats", () => {
  assert.equal(parseDollarsToCents("12"), 1200);
  assert.equal(parseDollarsToCents("12.5"), 1250);
  assert.equal(parseDollarsToCents("12.50"), 1250);
  assert.equal(parseDollarsToCents("0.01"), 1);
  assert.equal(parseDollarsToCents("$1,234.56"), 123456);
  assert.equal(parseDollarsToCents(" 19.99 "), 1999);
  assert.equal(parseDollarsToCents("19."), 1900);
  assert.equal(parseDollarsToCents("0.29"), 29); // classic float trap: 0.29 * 100 = 28.999…
});

test("parseDollarsToCents rejects invalid amounts", () => {
  for (const bad of ["", "0", "0.00", "-5", "abc", "1.234", "1e3", "12.3.4", "99999999"]) {
    assert.equal(parseDollarsToCents(bad), null, bad);
  }
});

test("formatCents", () => {
  assert.equal(formatCents(0), "$0.00");
  assert.equal(formatCents(5), "$0.05");
  assert.equal(formatCents(123456), "$1,234.56");
  assert.equal(formatCents(-1050), "-$10.50");
});
