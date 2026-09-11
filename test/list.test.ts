import { test } from "node:test";
import assert from "node:assert/strict";
import { renderVocabulary } from "../src/list.ts";
import { parseDefinitions } from "../src/parse.ts";

test("lists core verbs and project definitions", () => {
  const defs = parseDefinitions(
    'Composite: the user "{name}" is logged in\n' +
      '  When I open the page "index.html"\n' +
      '  Then I should be on the "app.html"\n' +
      "\n" +
      "Composite: the onboarding is done\n" +
      "  Then I should see exactly one such message\n",
  );
  const out = renderVocabulary(defs);
  assert.match(out, /# core verbs/);
  assert.match(out, /action\s+I click "{name}"/);
  assert.match(out, /observe\s+I should be on the "{page}"/);
  assert.match(out, /\[composite\] the user "{name}" is logged in/);
  assert.match(out, /\[composite\] the onboarding is done/);
  assert.match(out, /2 definitions/);
});

test("renders empty defs without a project section body", () => {
  const out = renderVocabulary([]);
  assert.match(out, /0 definitions/);
  assert.doesNotMatch(out, /\[composite\]|\[step\]/);
});
