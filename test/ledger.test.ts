import { test } from "node:test";
import assert from "node:assert/strict";
import {
  scenarioVerdict,
  report,
  reportJson,
  type StopRecord,
} from "../src/ledger.ts";

const rec = (
  scenario: string,
  stepIndex: number,
  step: string,
  verdict: StopRecord["verdict"],
  evidence: string,
  divergence?: string,
): StopRecord => ({ scenario, stepIndex, step, verdict, evidence, divergence });

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
