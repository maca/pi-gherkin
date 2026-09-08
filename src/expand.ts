// Composite expansion: unroll a step that references a composite into its
// concrete step list (planning time).
//
// - Only `Composite:` definitions expand; leaves pass through unchanged.
// - `{placeholders}` in the composite body are substituted from the matched
//   step's arguments.
// - Leading Gherkin keywords are stripped so nested references resolve.
// - Expansion is recursive (a composite body may reference other composites),
//   depth-guarded against self-reference.

import { matchPattern } from "./match.ts";
import type { Definition } from "./parse.ts";

const KEYWORD = /^(Given|When|Then|And|But|\*)\s+/;

export interface ExpandTrace {
  from: string;
  via: string;
  to: string[];
}

export function expandStep(
  step: string,
  defs: Definition[],
  depth = 0,
  trace?: ExpandTrace[],
): string[] {
  if (depth > 20) return [step]; // self-reference / runaway guard
  const entry = defs.find(
    (d) => d.kind === "composite" && matchPattern(d.pattern, step) !== null,
  );
  if (!entry) return [step];

  const params = matchPattern(entry.pattern, step)!;
  const out: string[] = [];
  for (const bodyStep of entry.body) {
    let concrete = bodyStep.replace(KEYWORD, "").trim();
    for (const [k, v] of Object.entries(params)) {
      concrete = concrete.split(`{${k}}`).join(v);
    }
    out.push(...expandStep(concrete, defs, depth + 1, trace));
  }
  trace?.push({ from: step, via: entry.pattern, to: out });
  return out;
}
