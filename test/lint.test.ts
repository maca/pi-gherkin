import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDefinitions } from "../src/parse.ts";
import { lintDefinitions } from "../src/lint.ts";

test("passes through purity violations from validateDefinitions", () => {
  const defs = parseDefinitions(`
Composite: a broken group
  run: something
`);
  const violations = lintDefinitions(defs);
  assert.ok(violations.some((v) => /must contain only steps/.test(v.message)));
});

test("flags a duplicate pattern defined more than once", () => {
  const defs = parseDefinitions(`
Composite: the user "{name}" is logged in
  When I open the page "index.html"

Composite: the user "{name}" is logged in
  When I reload the page
`);
  const violations = lintDefinitions(defs);
  assert.ok(violations.some((v) => /duplicate/i.test(v.message)));
});

test("flags a composite body step that resolves to nothing (core verb or definition)", () => {
  const defs = parseDefinitions(`
Composite: the user is set up
  When I frobnicate the whatsit
`);
  const violations = lintDefinitions(defs);
  assert.ok(violations.some((v) => /undefined step/i.test(v.message) && /frobnicate/.test(v.message)));
});

test("a composite body step matching a core verb is not flagged", () => {
  const defs = parseDefinitions(`
Composite: sign in
  When I click "Sign In"
  Then I should see the message "Welcome"
`);
  const violations = lintDefinitions(defs);
  assert.equal(violations.length, 0);
});

test("a composite body step referencing another composite definition is not flagged", () => {
  const defs = parseDefinitions(`
Composite: the user "{name}" is logged in
  When I open the page "index.html"
  And I fill the "Username" field with "{name}"

Composite: the setup is done
  Given the user "Macario" is logged in
`);
  const violations = lintDefinitions(defs);
  assert.equal(violations.length, 0);
});

test("leaf definitions are not checked for dangling references (they may be code leaves)", () => {
  const defs = parseDefinitions(`
step: the browser storage is empty
  \`\`\`js
  localStorage.clear();
  \`\`\`
`);
  const violations = lintDefinitions(defs);
  assert.equal(violations.length, 0);
});
