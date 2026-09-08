import { test } from "node:test";
import assert from "node:assert/strict";
import { expandStep, expandSteps, type ExpandTrace } from "../src/expand.ts";
import type { Definition, Mode } from "../src/parse.ts";

const def = (
  kind: Definition["kind"],
  pattern: string,
  body: string[],
  mode: Mode = "holds",
): Definition => ({ kind, pattern, body, mode });

test("expands a composite, substituting params and stripping keywords", () => {
  const defs = [
    def("composite", 'the user "{name}" is logged in', [
      'When I open the page "index.html"',
      'And I fill the "username" field with "{name}"',
    ]),
  ];
  assert.deepEqual(expandStep('the user "Macario" is logged in', defs), [
    'I open the page "index.html"',
    'I fill the "username" field with "Macario"',
  ]);
});

test("expands nested composites recursively", () => {
  const defs = [
    def("composite", 'the user "{name}" is logged in', [
      'When I open the page "index.html"',
      "And the onboarding is done",
    ]),
    def("composite", "the onboarding is done", ['And I click "Close"']),
  ];
  assert.deepEqual(expandStep('the user "Macario" is logged in', defs), [
    'I open the page "index.html"',
    'I click "Close"',
  ]);
});

test("non-composite steps pass through unchanged", () => {
  assert.deepEqual(expandStep('I click "X"', []), ['I click "X"']);
});

test("a leaf def match does not expand", () => {
  const defs = [def("leaf", "the browser storage is empty", ["```js", "x()", "```"])];
  assert.deepEqual(expandStep("the browser storage is empty", defs), [
    "the browser storage is empty",
  ]);
});

test("self-referential composite terminates", () => {
  const defs = [def("composite", "loop", ["And loop"])];
  const out = expandStep("loop", defs);
  assert.ok(Array.isArray(out), "must return an array, not recurse forever");
});

test("records an expansion trace", () => {
  const defs = [
    def("composite", 'the user "{name}" is logged in', ['When I open the page "index.html"']),
  ];
  const trace: ExpandTrace[] = [];
  expandStep('the user "Macario" is logged in', defs, 0, trace);
  assert.equal(trace.length, 1);
  assert.deepEqual(trace[0], {
    from: 'the user "Macario" is logged in',
    via: 'the user "{name}" is logged in',
    to: ['I open the page "index.html"'],
  });
});

test("expandSteps marks inverted composite steps inverted", () => {
  const defs = [
    def("composite", "the expected behavior is observed", ["Then I should see exactly one message"], "inverted"),
  ];
  assert.deepEqual(expandSteps("the expected behavior is observed", defs), [
    { text: "I should see exactly one message", mode: "inverted" },
  ]);
});

test("expandSteps defaults to holds and inherits through unmarked nesting", () => {
  const defs = [
    def("composite", "outer", ["And inner"]),
    def("composite", "inner", ['And I click "X"']),
  ];
  assert.deepEqual(expandSteps("outer", defs), [{ text: 'I click "X"', mode: "holds" }]);
});

test("inverted propagates through nested unmarked composites", () => {
  const defs = [
    def("composite", "outer", ["And inner"], "inverted"),
    def("composite", "inner", ['And I click "X"']),
  ];
  assert.deepEqual(expandSteps("outer", defs), [{ text: 'I click "X"', mode: "inverted" }]);
});

test("non-composite steps inherit the parent mode", () => {
  assert.deepEqual(expandSteps('I click "X"', [], "inverted"), [
    { text: 'I click "X"', mode: "inverted" },
  ]);
});
