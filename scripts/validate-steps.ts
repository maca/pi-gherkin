// CLI: lint features/steps/*.steps for purity violations, duplicate
// definitions, and dangling references — before ever driving a browser.
//
//   npm run validate-steps

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parseDefinitions } from "../src/parse.ts";
import { lintDefinitions } from "../src/lint.ts";

const root = process.cwd();
const dir = join(root, "features", "steps");

if (!existsSync(dir)) {
  console.error(`no such directory: ${dir}`);
  process.exit(1);
}

const files = readdirSync(dir).filter((f) => f.endsWith(".steps"));
const defs = files.flatMap((f) => parseDefinitions(readFileSync(join(dir, f), "utf8")));
const violations = lintDefinitions(defs);

console.log(`checked ${defs.length} definitions across ${files.length} files`);
if (violations.length === 0) {
  console.log("clean — no violations");
  process.exit(0);
}

for (const v of violations) {
  console.log(`  !! ${v.pattern} — ${v.message}`);
}
process.exit(1);
