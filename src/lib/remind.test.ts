import { test } from "node:test";
import assert from "node:assert/strict";
import { joinAnd, mailtoHref, reminderText } from "./remind.ts";

test("joinAnd lists amounts naturally", () => {
  assert.equal(joinAnd([]), "");
  assert.equal(joinAnd(["$5.00"]), "$5.00");
  assert.equal(joinAnd(["$5.00", "€2.00"]), "$5.00 and €2.00");
  assert.equal(joinAnd(["$5.00", "€2.00", "£1.00"]), "$5.00, €2.00 and £1.00");
});

test("reminder for a member links to the settle page", () => {
  const r = reminderText({ to: "Sam", from: "Alex", amounts: ["$230.88", "€28.80"], groupName: "Beach trip", link: "https://x/groups/1/settle" });
  assert.equal(r.subject, "Reminder: $230.88 and €28.80 for Beach trip");
  assert.match(r.body, /^Hi Sam,\n\nJust a friendly reminder that you owe me \$230\.88 and €28\.80 for "Beach trip"\./);
  assert.match(r.body, /record the payment here:\nhttps:\/\/x\/groups\/1\/settle\n\nThanks!\nAlex$/);
});

test("reminder for a stand-in asks them to pick their name", () => {
  const r = reminderText({ to: "Riley", from: "Alex", amounts: ["$20.00"], groupName: "Trip", link: "https://x/join/ABC123", standin: true });
  assert.match(r.body, /pick your name to see the details:\nhttps:\/\/x\/join\/ABC123/);
});

test("mailto encodes address, subject and body", () => {
  const href = mailtoHref("sam+1@example.com", { subject: "Reminder: $5 for A&B", body: "Hi\nthere" });
  assert.equal(href, "mailto:sam%2B1%40example.com?subject=Reminder%3A%20%245%20for%20A%26B&body=Hi%0Athere");
});
