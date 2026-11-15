import { test } from "node:test";
import assert from "node:assert/strict";
import { parseName } from "./names.ts";

test("parseName trims and collapses spaces", () => {
  assert.deepEqual(parseName("  Sam   Lee "), { name: "Sam Lee" });
});

test("parseName rejects empty and missing names", () => {
  assert.equal(parseName("   ").error, "Please enter your name.");
  assert.equal(parseName(null).error, "Please enter your name.");
});

test("parseName rejects names over 60 characters", () => {
  assert.ok(parseName("x".repeat(61)).error);
  assert.deepEqual(parseName("x".repeat(60)), { name: "x".repeat(60) });
});
