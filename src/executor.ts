// Step executor: run one concrete step's rendered agent-browser commands.
//
// The runner is injected, so the same logic is unit-testable with a fake and
// drivable for real with a child-process agent-browser runner. The phase
// determines failure semantics:
//
//   action  -> any non-zero exit is an execution error
//   observe -> non-zero exit is still *evidence* (e.g. wait --text timed out);
//              the agent judges the Then, the executor only gathers state.

import { resolve } from "./core.ts";

export type Runner = (cmd: string) => Promise<{
  code: number;
  stdout: string;
  stderr: string;
}>;

export interface ExecContext {
  run: Runner;
  baseUrl: string;
}

export type StepOutcome =
  | { kind: "action"; index: number; step: string; commands: string[]; code: number }
  | { kind: "observe"; index: number; step: string; evidence: string; code: number }
  | { kind: "undefined"; index: number; step: string }
  | { kind: "error"; index: number; step: string; error: string };

export async function executeStep(
  step: string,
  ctx: ExecContext,
  index = 0,
): Promise<StepOutcome> {
  const r = resolve(step, ctx);
  if (!r) return { kind: "undefined", index, step };

  let code = 0;
  let evidence = "";
  for (const cmd of r.commands) {
    const res = await ctx.run(cmd);
    code = res.code;
    evidence = (evidence ? evidence + "\n" : "") + (res.stdout || res.stderr);
    if (res.code !== 0 && r.phase === "action") {
      return {
        kind: "error",
        index,
        step,
        error: res.stderr || res.stdout || `exit ${res.code}`,
      };
    }
  }
  if (r.phase === "observe") return { kind: "observe", index, step, evidence, code };
  return { kind: "action", index, step, commands: r.commands, code };
}
