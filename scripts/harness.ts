// Harness driver (synthetic iteration — no browser yet).
//
// Drives the repo corpus through the deterministic core: parse step
// definitions + scenarios, validate purity, classify each used step
// (COMPOSITE / CORE / UNDEFINED), unroll composites, then simulate a run
// through the ledger and print the summary report.
//
// Usage: npm run harness [root]
// This is the seed of the `index` coverage tool and the future runner.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { parseDefinitions } from "../src/parse.ts";
import { matchPattern } from "../src/match.ts";
import { renderStep } from "../src/core.ts";
import { validateDefinitions } from "../src/validate.ts";
import { expandStep, expandSteps } from "../src/expand.ts";
import { report, type RunLedger } from "../src/ledger.ts";

const root = process.argv[2] ?? ".";
const baseUrl = "http://127.0.0.1:8099/";

const stepsDir = `${root}/features/steps`;
const defs = existsSync(stepsDir)
  ? readdirSync(stepsDir)
      .filter((f) => f.endsWith(".steps"))
      .flatMap((f) => parseDefinitions(readFileSync(`${stepsDir}/${f}`, "utf8")))
  : [];

console.log(`# definitions: ${defs.length}  (features/steps/)`);
for (const d of defs) console.log(`  [${d.kind}] ${d.pattern}`);

const violations = validateDefinitions(defs);
if (violations.length) {
  console.log(`\n# violations: ${violations.length}`);
  for (const v of violations) console.log(`  !! ${v.pattern} — ${v.message}`);
}

// Parse features into ordered scenarios (also build the deduped `used` set).
interface Scenario {
  name: string;
  steps: string[];
}
const scenarios: Scenario[] = [];
const used = new Map<string, string[]>();
const featuresDir = `${root}/features`;
if (existsSync(featuresDir)) {
  for (const f of readdirSync(featuresDir).filter((f) => f.endsWith(".feature"))) {
    let cur: Scenario | null = null;
    for (const line of readFileSync(`${featuresDir}/${f}`, "utf8").split("\n")) {
      const sc = /^\s*Scenario:\s*(.+)$/.exec(line);
      if (sc) {
        cur = { name: sc[1].trim(), steps: [] };
        scenarios.push(cur);
        continue;
      }
      const m = /^\s*(Given|When|Then|And|But|\*)\s+(.+)$/.exec(line);
      if (m) {
        const s = m[2].trim();
        if (cur) cur.steps.push(s);
        if (!used.has(s)) used.set(s, []);
        used.get(s)!.push(f);
      }
    }
  }
}

console.log(`\n# used steps: ${used.size}  (features/)`);
for (const [step, files] of used) {
  const def = defs.find((d) => matchPattern(d.pattern, step));
  const cmds = renderStep(step, { baseUrl });
  const status = def
    ? `COMPOSITE  -> ${def.pattern}`
    : cmds
      ? `CORE       -> ${cmds[0]}`
      : "UNDEFINED  (needs a def)";
  console.log(`  ${step}`);
  console.log(`      ${status}   (${files.join(", ")})`);
}

console.log(`\n# composite expansions (planning-time unroll):`);
for (const [step] of used) {
  const def = defs.find((d) => matchPattern(d.pattern, step));
  if (def && def.kind === "composite") {
    console.log(`  ${step}`);
    for (const concrete of expandStep(step, defs)) {
      const cmds = renderStep(concrete, { baseUrl });
      console.log(`      - ${concrete}`);
      console.log(`          ${cmds ? cmds[0] : "UNDEFINED"}`);
    }
  }
}

// Synthetic run: every step passes. Exercises the ledger + summary on the
// real corpus. (Actual:/Expected: bug-repro branching is scenario-tail
// syntax handled by the pi extension's own parser, not this seed script —
// see extension/gherkin-qa.ts.)
const ledger: RunLedger = { scenarios: [], records: [] };
for (const sc of scenarios) {
  ledger.scenarios.push(sc.name);
  const concrete = sc.steps.flatMap((s) => expandSteps(s, defs));
  concrete.forEach((st, i) => {
    ledger.records.push({
      scenario: sc.name,
      stepIndex: i,
      step: st.text,
      verdict: "success",
      evidence: (renderStep(st.text, { baseUrl }) ?? ["undefined"])[0],
    });
  });
}
console.log("\n# synthetic run (all steps pass):");
console.log(report(ledger, { mode: "summary" }));
