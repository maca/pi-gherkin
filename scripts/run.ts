// Real runner: drive the first scenario's steps through agent-browser until
// the first Then stop-point, printing its evidence. (Agent judgment arrives
// in the extension loop — here we stop and show what the harness observed.)
//
// Usage: BASE_URL=http://127.0.0.1:8100/ npm run run

import { exec } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { parseDefinitions } from "../src/parse.ts";
import { expandStep } from "../src/expand.ts";
import { executeStep, type Runner } from "../src/executor.ts";

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

function firstScenarioSteps(text: string): string[] {
  const steps: string[] = [];
  let started = false;
  for (const line of text.split("\n")) {
    if (/^\s*Scenario:/.test(line)) {
      if (started) break;
      started = true;
      continue;
    }
    if (!started) continue;
    const m = /^\s*(Given|When|Then|And|But|\*)\s+(.+)$/.exec(line);
    if (m) steps.push(m[2].trim());
  }
  return steps;
}

async function main() {
  const featureText = readFileSync(`${root}/features/order.feature`, "utf8");
  const concrete = firstScenarioSteps(featureText).flatMap((s) => expandStep(s, defs));

  console.log(`# concrete steps: ${concrete.length}  (baseUrl=${baseUrl})`);
  for (let i = 0; i < concrete.length; i++) {
    const out = await executeStep(concrete[i], { run: runner, baseUrl }, i);
    switch (out.kind) {
      case "action":
        console.log(`  ok    ${out.step}`);
        break;
      case "observe":
        console.log(`  stop  ${out.step}`);
        console.log(`        evidence: ${JSON.stringify(out.evidence)}`);
        return;
      case "undefined":
        console.log(`  UNDEFINED  ${out.step}`);
        return;
      case "error":
        console.log(`  ERROR  ${out.step}\n         ${out.error}`);
        return;
    }
  }
  console.log("# done (no stop-point reached)");
}

await main();
