import { test } from "node:test";
import assert from "node:assert/strict";
import {
  scenarioVerdict,
  report,
  reportJson,
  bugStatus,
  type StopRecord,
} from "../src/ledger.ts";

const rec = (
  scenario: string,
  stepIndex: number,
  step: string,
  verdict: StopRecord["verdict"],
  evidence: string,
  divergence?: string,
  branch?: StopRecord["branch"],
): StopRecord => ({ scenario, stepIndex, step, verdict, evidence, divergence, branch });

test("scenario verdict: all success", () => {
  assert.equal(
    scenarioVerdict([rec("s1", 0, "a", "success", "ok"), rec("s1", 1, "b", "success", "ok")]),
    "success",
  );
});

test("any fail makes the scenario fail", () => {
  assert.equal(
    scenarioVerdict([
      rec("s1", 0, "a", "success", "ok"),
      rec("s1", 1, "b", "fail", "nope", "expected X, got Y"),
    ]),
    "fail",
  );
});

test("precedence: fail > error > skip > success", () => {
  assert.equal(
    scenarioVerdict([rec("s1", 0, "a", "skip", ""), rec("s1", 1, "b", "error", "boom")]),
    "error",
  );
  assert.equal(
    scenarioVerdict([rec("s1", 0, "a", "skip", ""), rec("s1", 1, "b", "success", "ok")]),
    "skip",
  );
});

test("a scenario with no records is skip, not success", () => {
  assert.equal(scenarioVerdict([]), "skip");
});

test("summary report: one line per scenario, first failing step on fail", () => {
  const ledger = {
    scenarios: ["s1", "s2"],
    records: [
      rec("s1", 0, "a", "success", "ok"),
      rec("s2", 0, "x", "fail", "no", "e vs o"),
      rec("s2", 1, "y", "fail", "no", "e2 vs o2"),
    ],
  };
  const out = report(ledger, { mode: "summary" });
  assert.match(out, /s1\s+success/);
  assert.match(out, /s2\s+fail/);
  assert.match(out, /x/); // first failing step is named
  assert.doesNotMatch(out, /y/); // later failures collapse away in summary
});

test("trace report: one block per record with evidence and divergence", () => {
  const ledger = {
    scenarios: ["s1"],
    records: [rec("s1", 0, "a", "fail", "no", "e vs o")],
  };
  const out = report(ledger, { mode: "trace" });
  assert.match(out, /a/);
  assert.match(out, /evidence: no/);
  assert.match(out, /divergence: e vs o/);
});

test("reportJson returns the raw records", () => {
  const records = [rec("s1", 0, "a", "success", "ok")];
  assert.deepEqual(reportJson({ scenarios: ["s1"], records }), records);
});

test("bugStatus: null when there is no expected-branch record", () => {
  assert.equal(bugStatus([rec("s1", 0, "a", "success", "ok")]), null);
});

test("bugStatus: fixed when Expected holds (Actual short-circuited, never recorded)", () => {
  assert.equal(
    bugStatus([rec("s", 0, "expected", "success", "B", undefined, "expected")]),
    "fixed",
  );
});

test("bugStatus: reproduced when Expected fails and Actual holds", () => {
  assert.equal(
    bugStatus([
      rec("s", 0, "expected", "fail", "B", "div", "expected"),
      rec("s", 1, "actual", "success", "A", undefined, "actual"),
    ]),
    "reproduced",
  );
});

test("bugStatus: not-reproduced when both Expected and Actual fail", () => {
  assert.equal(
    bugStatus([
      rec("s", 0, "expected", "fail", "B", "d", "expected"),
      rec("s", 1, "actual", "fail", "A", "d", "actual"),
    ]),
    "not-reproduced",
  );
});

test("bugStatus: null when the expected-branch verdict is error", () => {
  assert.equal(
    bugStatus([rec("s", 0, "expected", "error", "boom", undefined, "expected")]),
    null,
  );
});

test("summary report shows bug-repro status instead of raw fail", () => {
  const ledger = {
    scenarios: ["s1"],
    records: [
      rec("s1", 0, "expected", "fail", "B", "div", "expected"),
      rec("s1", 1, "actual", "success", "A", undefined, "actual"),
    ],
  };
  const out = report(ledger, { mode: "summary" });
  assert.match(out, /s1\s+reproduced/);
});

test("actionable report: header counts and blocks for failures and bugs only", () => {
  const ledger = {
    scenarios: ["good", "bad", "bug1"],
    records: [
      rec("good", 0, "ok1", "success", "e"),
      rec("bad", 0, "x", "fail", "obs", "expected X observed Y"),
      rec("bug1", 0, "expected", "fail", "B", "div", "expected"),
      rec("bug1", 1, "actual", "success", "A", undefined, "actual"),
    ],
  };
  const out = report(ledger, { mode: "actionable" });
  assert.match(out, /3 scenarios/);
  assert.match(out, /1 success/);
  assert.match(out, /1 fail/);
  assert.match(out, /1 reproduced/);
  assert.match(out, /scenario bad/);
  assert.match(out, /->\s+reproduced/);
  assert.match(out, /divergence: div/);
  assert.doesNotMatch(out, /scenario good/); // passing scenario has no block
  assert.doesNotMatch(out, /ok1/); // its records are omitted
});
