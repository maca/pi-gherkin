// Run state machine: "harness drives, agent judges."
//
// Drives a concrete (already-expanded) step list: actions execute straight
// through, each observe step is a stop-point where evidence is handed to an
// injected judge. The judge's verdict is recorded to the ledger. The onFail
// toggle governs whether a `fail` verdict halts the scenario ("stop") or
// collects all failures ("continue"). Execution errors and undefined steps
// always halt (the machine cannot continue deterministically).

import { executeStep, type Runner, type StepOutcome } from "./executor.ts";
import type { Step } from "./expand.ts";
import type { StopRecord, Verdict } from "./ledger.ts";

export type Judge = (
  step: string,
  evidence: string,
  code: number,
) => Verdict | Promise<Verdict>;

export interface RunOptions {
  run: Runner;
  baseUrl: string;
  judge: Judge;
  scenario: string;
  onFail?: "stop" | "continue";
  /** Observability hook, called after each step is executed. */
  onStep?: (outcome: StepOutcome) => void;
}

export async function runScenario(
  steps: Step[],
  opts: RunOptions,
): Promise<StopRecord[]> {
  const records: StopRecord[] = [];
  const onFail = opts.onFail ?? "continue";
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const out = await executeStep(step.text, { run: opts.run, baseUrl: opts.baseUrl }, i);
    opts.onStep?.(out);
    switch (out.kind) {
      case "action":
        continue;
      case "observe": {
        const verdict = await opts.judge(step.text, out.evidence, out.code);
        records.push({
          scenario: opts.scenario,
          stepIndex: i,
          step: step.text,
          verdict,
          evidence: out.evidence,
          mode: step.mode,
        });
        if (verdict === "fail" && onFail === "stop") return records;
        if (verdict === "error") return records;
        continue;
      }
      case "undefined":
        records.push({
          scenario: opts.scenario,
          stepIndex: i,
          step: step.text,
          verdict: "error",
          evidence: "",
          divergence: "no core verb or definition (add a def or extend the core)",
          mode: step.mode,
        });
        return records;
      case "error":
        records.push({
          scenario: opts.scenario,
          stepIndex: i,
          step: step.text,
          verdict: "error",
          evidence: out.error,
          mode: step.mode,
        });
        return records;
    }
  }
  return records;
}
