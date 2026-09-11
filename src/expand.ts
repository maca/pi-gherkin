// Composite expansion: unroll a step that references a composite into its
// concrete step list (planning time).
//
// - Only `Composite:` definitions expand; leaves pass through unchanged.
// - `{placeholders}` in the composite body are substituted from the matched
//   step's arguments.
// - Leading Gherkin keywords are stripped so nested references resolve.
// - Expansion is recursive (a composite body may reference other composites),
//   depth-guarded against self-reference.
//
// Bug-repro Actual:/Expected: branching is a separate, scenario-level
// mechanism (see extension/gherkin-qa.ts) — it does not flow through here.

import { matchPattern } from "./match.ts";
import type { Definition } from "./parse.ts";

const KEYWORD = /^(Given|When|Then|And|But|\*)\s+/;

export interface ExpandTrace {
  from: string;
  via: string;
  to: string[];
}

/** A concrete step. */
export interface Step {
  text: string;
}

/** Expand a step into its concrete step list (recursive composite unroll). */
export function expandSteps(
  step: string,
  defs: Definition[],
  depth = 0,
  trace?: ExpandTrace[],
): Step[] {
  if (depth > 20) return [{ text: step }]; // self-reference guard
  const entry = defs.find(
    (d) => d.kind === "composite" && matchPattern(d.pattern, step) !== null,
  );
  if (!entry) return [{ text: step }];

  const params = matchPattern(entry.pattern, step)!;
  const out: Step[] = [];
  for (const bodyStep of entry.body) {
    let concrete = bodyStep.replace(KEYWORD, "").trim();
    for (const [k, v] of Object.entries(params)) {
      concrete = concrete.split(`{${k}}`).join(v);
    }
    out.push(...expandSteps(concrete, defs, depth + 1, trace));
  }
  trace?.push({ from: step, via: entry.pattern, to: out.map((s) => s.text) });
  return out;
}

/** String-only expansion (convenience wrapper). */
export function expandStep(
  step: string,
  defs: Definition[],
  depth = 0,
  trace?: ExpandTrace[],
): string[] {
  return expandSteps(step, defs, depth, trace).map((s) => s.text);
}
