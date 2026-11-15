import { test } from "node:test";
import assert from "node:assert/strict";
import { friendBalances, type FriendGroupInput } from "./friends.ts";

const m = (id: string, extra: Partial<{ email: string; standin: boolean }> = {}) => ({ id, name: id.toUpperCase(), email: "", standin: false, ...extra });
const split = (...pairs: [string, number][]) => pairs.map(([user_id, share_cents]) => ({ user_id, share_cents }));

// The demo account: Beach trip (Sam and Riley owe in USD and EUR) and Apartment (Sam owes rent).
const beach: FriendGroupInput = {
  id: "g1", name: "Beach trip", simplify: true, joinCode: "AAA111",
  members: [m("me"), m("sam"), m("riley")],
  expenses: [
    { amount_cents: 9000, currency: "USD", paid_by: "me", splits: split(["me", 3000], ["sam", 3000], ["riley", 3000]) },
    { amount_cents: 6000, currency: "EUR", paid_by: "me", splits: split(["me", 2000], ["sam", 2000], ["riley", 2000]) },
  ],
  payments: [{ from_user: "riley", to_user: "me", amount_cents: 1000, currency: "USD" }],
};
const apartment: FriendGroupInput = {
  id: "g2", name: "Apartment", simplify: true, joinCode: "BBB222",
  members: [m("me"), m("sam")],
  expenses: [{ amount_cents: 200000, currency: "USD", paid_by: "me", splits: split(["me", 100000], ["sam", 100000]) }],
  payments: [],
};

test("totals across groups, per currency, with per-group lines", () => {
  const list = friendBalances("me", [beach, apartment]);
  assert.deepEqual(list.map((f) => f.id), ["riley", "sam"]); // with a balance first, then by name
  const [riley, sam] = list;
  assert.deepEqual(sam.totals, [{ currency: "EUR", cents: 2000 }, { currency: "USD", cents: 103000 }]);
  assert.deepEqual(sam.groups.map((g) => [g.groupName, g.lines]), [
    ["Apartment", [{ currency: "USD", cents: 100000 }]],
    ["Beach trip", [{ currency: "EUR", cents: 2000 }, { currency: "USD", cents: 3000 }]],
  ]);
  assert.deepEqual(riley.totals, [{ currency: "EUR", cents: 2000 }, { currency: "USD", cents: 2000 }]);
  assert.equal(riley.groups.length, 1);
});

test("what you owe is negative and nets against what they owe", () => {
  const trip: FriendGroupInput = {
    id: "g3", name: "Trip", simplify: true, joinCode: "CCC333", members: [m("me"), m("bo")],
    expenses: [{ amount_cents: 4000, currency: "USD", paid_by: "bo", splits: split(["me", 2000], ["bo", 2000]) }], payments: [],
  };
  const dinner: FriendGroupInput = {
    id: "g4", name: "Dinner", simplify: false, joinCode: "DDD444", members: [m("me"), m("bo")],
    expenses: [{ amount_cents: 6000, currency: "USD", paid_by: "me", splits: split(["me", 3000], ["bo", 3000]) }], payments: [],
  };
  const [bo] = friendBalances("me", [trip, dinner]);
  assert.deepEqual(bo.groups.find((g) => g.groupName === "Trip")!.lines, [{ currency: "USD", cents: -2000 }]);
  assert.deepEqual(bo.totals, [{ currency: "USD", cents: 1000 }]);
});

test("settled friends and stand-ins are listed; settled ones last", () => {
  const g: FriendGroupInput = {
    id: "g5", name: "Club", simplify: true, joinCode: "EEE555",
    members: [m("me"), m("ann"), m("zed", { standin: true })],
    expenses: [{ amount_cents: 1000, currency: "USD", paid_by: "me", splits: split(["me", 500], ["zed", 500]) }], payments: [],
  };
  const list = friendBalances("me", [g]);
  assert.deepEqual(list.map((f) => [f.id, f.standin, f.totals.length]), [["zed", true, 1], ["ann", false, 0]]);
  assert.deepEqual(list[1].groups[0].lines, []);
});

test("old expenses without splits are shared equally among members", () => {
  const g: FriendGroupInput = {
    id: "g6", name: "Old", simplify: true, joinCode: "FFF666", members: [m("me"), m("kim")],
    expenses: [{ amount_cents: 1000, currency: "USD", paid_by: "me", splits: [] }], payments: [],
  };
  assert.deepEqual(friendBalances("me", [g])[0].totals, [{ currency: "USD", cents: 500 }]);
});

test("the user's default currency is listed first", () => {
  const [, sam] = friendBalances("me", [beach, apartment], "USD");
  assert.deepEqual(sam.totals.map((l) => l.currency), ["USD", "EUR"]);
  assert.deepEqual(sam.groups.find((g) => g.groupName === "Beach trip")!.lines.map((l) => l.currency), ["USD", "EUR"]);
});
