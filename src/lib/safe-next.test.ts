import { test } from "node:test";
import assert from "node:assert/strict";
import { safeNextPath } from "./safe-next.ts";

const BASE = "https://splitwise.example/auth/callback?code=abc";
const ORIGIN = new URL(BASE).origin;

test("safeNextPath keeps same-site paths", () => {
  assert.equal(safeNextPath("/dashboard", BASE), "/dashboard");
  assert.equal(safeNextPath("/groups/1?x=y", BASE), "/groups/1?x=y");
  assert.equal(safeNextPath("/reset-password", BASE), "/reset-password");
  assert.equal(safeNextPath("/groups/1#comments", BASE), "/groups/1#comments");
  assert.equal(safeNextPath(`${ORIGIN}/groups/2`, BASE), "/groups/2");
});

test("safeNextPath falls back to / for missing values", () => {
  assert.equal(safeNextPath(null, BASE), "/");
  assert.equal(safeNextPath(undefined, BASE), "/");
  assert.equal(safeNextPath("", BASE), "/");
});

const attacks = [
  "//evil.com",
  "/\\evil.com",
  "\\\\evil.com",
  "/\t/evil.com",
  "/\n/evil.com",
  "/\r/evil.com",
  "https://evil.com",
  "https://evil.com/groups/1",
  "http://splitwise.example/dashboard", // same host, different scheme
  "https://splitwise.example.evil.com/",
  "https://splitwise.example@evil.com/",
  "javascript:alert(1)",
  "JaVaScRiPt:alert(1)",
  "data:text/html,<script>alert(1)</script>",
  "/.//evil.com",
  "/..//evil.com",
  "/a/../..//evil.com",
];

test("safeNextPath rejects other origins and slash tricks", () => {
  for (const next of attacks) assert.equal(safeNextPath(next, BASE), "/", JSON.stringify(next));
});

test("safeNextPath result always resolves to our own origin", () => {
  for (const next of [...attacks, "/dashboard", "/groups/1?x=y", "relative/path", "?q=1", "#top", "%2F%2Fevil.com"]) {
    const path = safeNextPath(next, BASE);
    assert.ok(path.startsWith("/") && !path.startsWith("//"), JSON.stringify(next));
    assert.equal(new URL(path, BASE).origin, ORIGIN, JSON.stringify(next));
  }
});

test("safeNextPath handles a bad base without throwing", () => {
  assert.equal(safeNextPath("/dashboard", "not a url"), "/");
});
