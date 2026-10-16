import { test } from "node:test";
import assert from "node:assert/strict";
import { formatMoney, minorDigits, parseAmount, toDecimalString } from "./money.ts";

test("parseAmount (USD)", () => {
  assert.equal(parseAmount("12"), 1200);
  assert.equal(parseAmount("12.5"), 1250);
  assert.equal(parseAmount("$1,234.56"), 123456);
  assert.equal(parseAmount("0.29"), 29); // float trap: 0.29 * 100 = 28.999…
  assert.equal(parseAmount("19."), 1900);
  for (const bad of ["", "0", "-5", "abc", "1.234", "1e3", "12.3.4", "99999999999"]) {
    assert.equal(parseAmount(bad), null, bad);
  }
  assert.equal(parseAmount("0", "USD", true), 0);
});

test("parseAmount respects currency decimals", () => {
  assert.equal(minorDigits("JPY"), 0);
  assert.equal(minorDigits("EUR"), 2);
  assert.equal(parseAmount("1500", "JPY"), 1500);
  assert.equal(parseAmount("1500.50", "JPY"), null);
  assert.equal(parseAmount("€9.99", "EUR"), 999);
});

test("formatMoney", () => {
  assert.equal(formatMoney(0), "$0.00");
  assert.equal(formatMoney(123456), "$1,234.56");
  assert.equal(formatMoney(-1050), "-$10.50");
  assert.equal(formatMoney(999, "EUR"), "€9.99");
  assert.equal(formatMoney(1500, "JPY"), "¥1,500");
  assert.equal(formatMoney(500, "GBP"), "£5.00");
});

test("toDecimalString round-trips", () => {
  assert.equal(toDecimalString(1250), "12.50");
  assert.equal(toDecimalString(5), "0.05");
  assert.equal(toDecimalString(1500, "JPY"), "1500");
  assert.equal(parseAmount(toDecimalString(123456)), 123456);
});
