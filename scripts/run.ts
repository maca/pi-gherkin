// Real runner: drive the first scenario end-to-end through the run state
// machine against live agent-browser. A deterministic auto-judge (exit code
// 0 => success, else fail) stands in for the LLM judge until the pi extension
// supplies the real stop-point handoff.
//
// Usage: BASE_URL=http://127.0.0.1:8100/ npm run run

import { exec } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { parseDefinitions } from "../src/parse.ts";
import { expandSteps } from "../src/expand.ts";
import { runScenario, type Judge } from "../src/scenario.ts";
import { report, type RunLedger } from "../src/ledger.ts";
import type { Runner } from "../src/executor.ts";

const root = ".";
const baseUrl = process.env.BASE_URL ?? "http://127.0.0.1:8099/";

const defs = readdirSync(`${root}/features/steps`)
  .filter((f) => f.endsWith(".steps"))
  .flatMap((f) => parseDefinitions(readFileSync(`${root}/features/steps/${f}`, "utf8")));

const runner: Runner = (cmd) =>
  new Promise((res) => {
    exec(cmd, { timeout: 30000 }, (err, stdout, stderr) => {
      const code = err ? (typeof err.code === "number" ? err.code : 1) : 0;
      res({ code, stdout, stderr });
    });
  });

function firstScenario(text: string): { name: string; steps: string[] } {
  const steps: string[] = [];
  let name = "";
  let started = false;
  for (const line of text.split("\n")) {
    const sc = /^\s*Scenario:\s*(.+)$/.exec(line);
    if (sc) {
      if (started) break;
      started = true;
      name = sc[1].trim();
      continue;
    }
    if (!started) continue;
    const m = /^\s*(Given|When|Then|And|But|\*)\s+(.+)$/.exec(line);
    if (m) steps.push(m[2].trim());
  }
  return { name, steps };
}

async function main() {
  const { name, steps } = firstScenario(
    readFileSync(`${root}/features/order.feature`, "utf8"),
  );
  const concrete = steps.flatMap((s) => expandSteps(s, defs));

  const judge: Judge = (_step, _evidence, code) => (code === 0 ? "success" : "fail");

  console.log(`# scenario: ${name}  (${concrete.length} concrete steps)`);
  const records = await runScenario(concrete, {
    run: runner,
    baseUrl,
    judge,
    scenario: name,
    onFail: "continue",
    onStep: (out) => {
      if (out.kind === "action") console.log(`  ok    ${out.step}`);
      else if (out.kind === "observe")
        console.log(`  stop  ${out.step}\n        ${JSON.stringify(out.evidence)}`);
    },
  });

  const ledger: RunLedger = { scenarios: [name], records };
  console.log("\n# report (summary):");
  console.log(report(ledger, { mode: "summary" }));
  console.log("\n# report (trace):");
  console.log(report(ledger, { mode: "trace" }));
}

await main();
