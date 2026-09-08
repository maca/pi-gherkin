import { test } from "node:test";
import assert from "node:assert/strict";
import { renderStep, listCore } from "../src/core.ts";

test("click renders a find-text click", () => {
  assert.deepEqual(renderStep('I click "Submit Order"'), [
    'agent-browser find text "Submit Order" click',
  ]);
});

test("fill renders a find-label fill", () => {
  assert.deepEqual(
    renderStep('I fill the "username" field with "Macario"'),
    ['agent-browser find label "username" fill "Macario"'],
  );
});

test("open resolves a relative path against baseUrl", () => {
  assert.deepEqual(
    renderStep('I open the page "index.html"', {
      baseUrl: "http://127.0.0.1:8099/",
    }),
    ["agent-browser open http://127.0.0.1:8099/index.html"],
  );
});

test("open passes an absolute url through untouched", () => {
  assert.deepEqual(renderStep('I open the page "https://x.example/a"', { baseUrl: "http://b/" }), [
    "agent-browser open https://x.example/a",
  ]);
});

test("see-the-message renders an observation wait", () => {
  assert.deepEqual(renderStep('I should see the message "Honky dory!"'), [
    'agent-browser wait --text "Honky dory!"',
  ]);
});

test("on-a-named-page renders a url observation", () => {
  assert.deepEqual(renderStep("I should be on the dashboard"), ["agent-browser get url"]);
});

test("unknown phrasing renders null", () => {
  assert.equal(renderStep("frobnicate the widget"), null);
});

test("listCore enumerates the canonical patterns", () => {
  const patterns = listCore().map((v) => v.pattern);
  assert.ok(patterns.length >= 8, "expected at least 8 core verbs");
  assert.ok(patterns.includes('I click "{name}"'));
  assert.ok(patterns.includes('I should see the message "{text}"'));
});
