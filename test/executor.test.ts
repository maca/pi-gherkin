import { test } from "node:test";
import assert from "node:assert/strict";
import { executeStep, type Runner } from "../src/executor.ts";
import { phaseOf } from "../src/core.ts";

function fakeRun(
  script: Record<string, { code?: number; stdout?: string; stderr?: string }>,
  log: string[],
): Runner {
  return async (cmd) => {
    log.push(cmd);
    const r = script[cmd] ?? { code: 0, stdout: "ok", stderr: "" };
    return { code: r.code ?? 0, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
  };
}

test("action step executes its rendered command", async () => {
  const log: string[] = [];
  const out = await executeStep('I click "X"', { run: fakeRun({}, log), baseUrl: "http://b/" });
  assert.equal(out.kind, "action");
  assert.deepEqual(log, ['agent-browser find text "X" click']);
});

test("observe step returns evidence from stdout", async () => {
  const log: string[] = [];
  const out = await executeStep('I should see the message "Hi"', {
    run: fakeRun({ 'agent-browser wait --text "Hi"': { code: 0, stdout: "Hi" } }, log),
    baseUrl: "http://b/",
  });
  assert.equal(out.kind, "observe");
  assert.equal(out.evidence, "Hi");
});

test("undefined step yields undefined", async () => {
  const out = await executeStep("frobnicate", { run: fakeRun({}, []), baseUrl: "http://b/" });
  assert.equal(out.kind, "undefined");
});

test("action command failure yields error with stderr", async () => {
  const log: string[] = [];
  const out = await executeStep('I click "X"', {
    run: fakeRun(
      { 'agent-browser find text "X" click': { code: 1, stderr: "no element" } },
      log,
    ),
    baseUrl: "http://b/",
  });
  assert.equal(out.kind, "error");
  assert.match(out.error, /no element/);
});

test("observe command failure is evidence, not an execution error", async () => {
  const log: string[] = [];
  const out = await executeStep('I should see the message "Hi"', {
    run: fakeRun(
      { 'agent-browser wait --text "Hi"': { code: 1, stderr: "timeout" } },
      log,
    ),
    baseUrl: "http://b/",
  });
  assert.equal(out.kind, "observe");
  assert.equal(out.code, 1);
});

test("phaseOf classifies action vs observe", () => {
  assert.equal(phaseOf('I click "X"'), "action");
  assert.equal(phaseOf('I should see the message "Hi"'), "observe");
  assert.equal(phaseOf("frobnicate"), null);
});
