import { test } from "node:test";
import assert from "node:assert/strict";
import { filterExpenses, filterPayments, hasFilters, parseFilters } from "./filters.ts";

const e = (description: string, extra = {}) => ({
  description, notes: null as string | null, category: "food", currency: "USD", expense_date: "2026-10-10",
  paid_by: "a", splits: [{ user_id: "a" }, { user_id: "b" }], ...extra,
});
const list = [e("Dinner"), e("Taxi", { category: "transport", currency: "EUR" }), e("Rent", { notes: "October", paid_by: "c", splits: [{ user_id: "c" }], expense_date: "2026-09-01" })];

test("filters combine", () => {
  assert.deepEqual(filterExpenses(list, { q: "din" }).map((x) => x.description), ["Dinner"]);
  assert.deepEqual(filterExpenses(list, { q: "october" }).map((x) => x.description), ["Rent"]);
  assert.deepEqual(filterExpenses(list, { category: "transport" }).map((x) => x.description), ["Taxi"]);
  assert.deepEqual(filterExpenses(list, { person: "b" }).map((x) => x.description), ["Dinner", "Taxi"]);
  assert.deepEqual(filterExpenses(list, { from: "2026-10-01" }).map((x) => x.description), ["Dinner", "Taxi"]);
  assert.deepEqual(filterExpenses(list, { to: "2026-09-30", currency: "USD" }).map((x) => x.description), ["Rent"]);
});

test("payments and parsing", () => {
  const p = [{ from_user: "a", to_user: "b", currency: "USD", paid_on: "2026-10-01", note: "Venmo" }];
  assert.equal(filterPayments(p, { q: "venmo" }).length, 1);
  assert.equal(filterPayments(p, { category: "food" }).length, 0);
  assert.equal(filterPayments(p, { person: "c" }).length, 0);
  const f = parseFilters({ q: " pizza ", from: "bad", to: "2026-10-31", category: "" });
  assert.deepEqual(f, { q: "pizza", category: undefined, person: undefined, currency: undefined, from: undefined, to: "2026-10-31" });
  assert.equal(hasFilters({}), false);
  assert.equal(hasFilters(f), true);
});
