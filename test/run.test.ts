import { test } from "node:test";
import assert from "node:assert/strict";
import { runScenario, type Judge } from "../src/scenario.ts";
import type { Runner } from "../src/executor.ts";
import type { Step } from "../src/expand.ts";

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

const ok: Judge = () => "success";
const fail: Judge = () => "fail";

const st = (text: string, mode: Step["mode"] = "holds"): Step => ({ text, mode });

const steps: Step[] = [
  st('I click "A"'),
  st('I should see the message "Hi"'),
  st('I click "B"'),
  st('I should see the message "Bye"'),
];

test("drives actions and records a verdict at each observe stop", async () => {
  const log: string[] = [];
  const records = await runScenario(steps, {
    run: fakeRun({}, log),
    baseUrl: "http://b/",
    judge: ok,
    scenario: "s",
  });
  assert.deepEqual(log, [
    'agent-browser find text "A" click',
    'agent-browser wait --text "Hi"',
    'agent-browser find text "B" click',
    'agent-browser wait --text "Bye"',
  ]);
  assert.equal(records.length, 2);
  assert.deepEqual(records.map((r) => r.verdict), ["success", "success"]);
});

test("onFail stop aborts at the first failing observe", async () => {
  const log: string[] = [];
  const records = await runScenario(steps, {
    run: fakeRun({}, log),
    baseUrl: "http://b/",
    judge: fail,
    scenario: "s",
    onFail: "stop",
  });
  assert.equal(records.length, 1);
  assert.equal(records[0].verdict, "fail");
  assert.ok(!log.includes('agent-browser wait --text "Bye"'), "second observe must not run");
});

test("onFail continue collects all failures", async () => {
  const records = await runScenario(steps, {
    run: fakeRun({}, []),
    baseUrl: "http://b/",
    judge: fail,
    scenario: "s",
    onFail: "continue",
  });
  assert.equal(records.length, 2);
  assert.deepEqual(records.map((r) => r.verdict), ["fail", "fail"]);
});

test("action execution error aborts with an error verdict", async () => {
  const log: string[] = [];
  const records = await runScenario([st('I click "A"'), st('I should see the message "Hi"')], {
    run: fakeRun({ 'agent-browser find text "A" click': { code: 1, stderr: "boom" } }, log),
    baseUrl: "http://b/",
    judge: ok,
    scenario: "s",
  });
  assert.equal(records.length, 1);
  assert.equal(records[0].verdict, "error");
  assert.match(records[0].evidence, /boom/);
});

test("undefined step aborts with an error verdict", async () => {
  const records = await runScenario([st("frobnicate")], {
    run: fakeRun({}, []),
    baseUrl: "http://b/",
    judge: ok,
    scenario: "s",
  });
  assert.equal(records.length, 1);
  assert.equal(records[0].verdict, "error");
  assert.match(records[0].divergence ?? "", /no core/i);
});

test("records the step's checking mode on stop records", async () => {
  const records = await runScenario(
    [st('I click "A"'), st('I should see the message "Hi"', "inverted")],
    {
      run: fakeRun({}, []),
      baseUrl: "http://b/",
      judge: ok,
      scenario: "s",
    },
  );
  assert.equal(records.length, 1);
  assert.equal(records[0].mode, "inverted");
  assert.equal(records[0].step, 'I should see the message "Hi"');
});
