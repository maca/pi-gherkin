import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDefinitions } from "../src/parse.ts";
import { validateDefinitions } from "../src/validate.ts";

test("valid corpus yields no violations", () => {
  const text = [
    'Composite: the user "{name}" is logged in',
    '  When I open the page "index.html"',
    '  And I click "Sign In"',
    "step: the browser storage is empty",
    "  ```js",
    "  localStorage.clear()",
    "  ```",
  ].join("\n");
  assert.deepEqual(validateDefinitions(parseDefinitions(text)), []);
});

test("composite with a code fence is a violation", () => {
  const text = ["Composite: setup", "  ```js", "  x()", "  ```"].join("\n");
  const v = validateDefinitions(parseDefinitions(text));
  assert.equal(v.length, 1);
  assert.match(v[0].message, /only steps/i);
});

test("composite with a run: op is a violation", () => {
  const text = ["Composite: setup", "  run: click X"].join("\n");
  const v = validateDefinitions(parseDefinitions(text));
  assert.equal(v.length, 1);
  assert.match(v[0].message, /only steps/i);
});

test("empty composite is a violation", () => {
  const text = ["Composite: setup"].join("\n");
  const v = validateDefinitions(parseDefinitions(text));
  assert.equal(v.length, 1);
  assert.match(v[0].message, /empty/i);
});

test("leaf with a Gherkin body is a violation (use Composite:)", () => {
  const text = ['step: the user "{name}" is logged in', '  When I open the page "x"'].join("\n");
  const v = validateDefinitions(parseDefinitions(text));
  assert.equal(v.length, 1);
  assert.match(v[0].message, /Composite/);
});

test("leaf marked [inverted] is a violation", () => {
  const text = ["step: do it [inverted]", "  run: click X"].join("\n");
  const v = validateDefinitions(parseDefinitions(text));
  assert.equal(v.length, 1);
  assert.match(v[0].message, /Composite/);
});

test("leaf with run ops or code is valid", () => {
  const text = ["step: seed it", "  run: click X", "  ```js", "  y()", "  ```"].join("\n");
  assert.deepEqual(validateDefinitions(parseDefinitions(text)), []);
});
