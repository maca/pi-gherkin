import { test } from "node:test";
import assert from "node:assert/strict";
import { matchPattern } from "../src/match.ts";

test("matches a quoted placeholder and captures the unquoted value", () => {
  assert.deepEqual(matchPattern('I click "{name}"', 'I click "Submit Order"'), {
    name: "Submit Order",
  });
});

test("matches two placeholders separated by literal glue words", () => {
  assert.deepEqual(
    matchPattern(
      'I fill the "{label}" field with "{value}"',
      'I fill the "item" field with "Wonder Widget"',
    ),
    { label: "item", value: "Wonder Widget" },
  );
});

test("a quoted placeholder also captures a bare word", () => {
  assert.deepEqual(
    matchPattern('I should be on the "{page}"', "I should be on the dashboard"),
    { page: "dashboard" },
  );
});

test("captures bare placeholders", () => {
  assert.deepEqual(matchPattern("wait {ms} ms", "wait 200 ms"), { ms: "200" });
});

test("returns null on literal mismatch", () => {
  assert.equal(matchPattern('I click "{name}"', 'I press "Enter"'), null);
});

test("returns null on token-count mismatch", () => {
  assert.equal(matchPattern('I click "{name}"', "I click"), null);
});
