import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDefinitions } from "../src/parse.ts";

test("parses a Composite: entry with an indented Gherkin body", () => {
  const text = [
    "# login flow",
    'Composite: the user "{name}" is logged in',
    '  When I open the page "index.html"',
    '  And I fill the "username" field with "{name}"',
    "",
    '  And I click "Sign In"',
    "  Then I should be on the dashboard",
  ].join("\n");
  assert.deepEqual(parseDefinitions(text), [
    {
      kind: "composite",
      pattern: 'the user "{name}" is logged in',
      body: [
        'When I open the page "index.html"',
        'And I fill the "username" field with "{name}"',
        'And I click "Sign In"',
        "Then I should be on the dashboard",
      ],
    },
  ]);
});

test("parses a leaf step: with a js code fence body", () => {
  const text = [
    "step: the browser storage is empty",
    "  ```js",
    "  sessionStorage.clear();",
    "  ({ cleared: true })",
    "  ```",
  ].join("\n");
  assert.deepEqual(parseDefinitions(text), [
    {
      kind: "leaf",
      pattern: "the browser storage is empty",
      body: ["```js", "sessionStorage.clear();", "({ cleared: true })", "```"],
    },
  ]);
});

test("collects multiple entries; headers are case-insensitive", () => {
  const text = [
    "# head",
    'STEP: do "{x}"',
    "  alpha",
    'Composite: g "{y}"',
    "  beta",
  ].join("\n");
  const out = parseDefinitions(text);
  assert.equal(out.length, 2);
  assert.deepEqual(out[0], { kind: "leaf", pattern: 'do "{x}"', body: ["alpha"] });
  assert.deepEqual(out[1], {
    kind: "composite",
    pattern: 'g "{y}"',
    body: ["beta"],
  });
});

test("indented lookalike headers stay in the body, not new entries", () => {
  const text = ["Composite: a", "  step: not a header", "  ```"].join("\n");
  const out = parseDefinitions(text);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0].body, ["step: not a header", "```"]);
});

test("empty and comment-only files yield no entries", () => {
  assert.deepEqual(parseDefinitions(""), []);
  assert.deepEqual(parseDefinitions("# just a comment\n\n# another\n"), []);
});

test("headers are anchored: step-proxy: is stray text, not a header", () => {
  const text = 'step-proxy: nope\n\nstep: real\n  body\n';
  const out = parseDefinitions(text);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0], { kind: "leaf", pattern: "real", body: ["body"] });
});
