// Harness driver (synthetic iteration — no browser yet).
//
// Drives the repo corpus through the deterministic core: parse step
// definitions, extract used steps from features, then classify each used
// step as COMPOSITE (a def), CORE (renders to an agent-browser command), or
// UNDEFINED (needs a def / extends baseline).
//
// Usage: npm run harness [root]
// This is the seed of the `index` coverage tool and, later, the runner.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { parseDefinitions } from "../src/parse.ts";
import { matchPattern } from "../src/match.ts";
import { renderStep } from "../src/core.ts";
import { validateDefinitions } from "../src/validate.ts";

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

const featuresDir = `${root}/features`;
const used = new Map<string, string[]>();
if (existsSync(featuresDir)) {
  for (const f of readdirSync(featuresDir).filter((f) => f.endsWith(".feature"))) {
    for (const line of readFileSync(`${featuresDir}/${f}`, "utf8").split("\n")) {
      const m = /^\s*(Given|When|Then|And|But|\*)\s+(.+)$/.exec(line);
      if (m) {
        const s = m[2].trim();
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
