import { test } from "node:test";
import assert from "node:assert/strict";
import { csvCell, toCsv } from "./csv.ts";

test("csv escaping", () => {
  assert.equal(csvCell("plain"), "plain");
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell("a,b"), '"a,b"');
  assert.equal(csvCell("line\nbreak"), '"line\nbreak"');
  assert.equal(csvCell(null), "");
  assert.equal(csvCell(-12.5), "-12.5");
  assert.equal(csvCell("=HYPERLINK(1)"), "'=HYPERLINK(1)"); // formula injection neutralized
  assert.equal(toCsv([["a", 1], ["b,c", null]]), 'a,1\r\n"b,c",\r\n');
});
