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
import type { Definition, Mode } from "./parse.ts";

const KEYWORD = /^(Given|When|Then|And|But|\*)\s+/;

export interface ExpandTrace {
  from: string;
  via: string;
  to: string[];
}

/** A concrete step with its inherited checking mode. */
export interface Step {
  text: string;
  mode: Mode;
}

/**
 * Expand a step into concrete steps with their checking mode.
 * A composite marked `[inverted]` forces `inverted` on its entire body
 * (recursively); unmarked composites inherit the enclosing mode.
 */
export function expandSteps(
  step: string,
  defs: Definition[],
  parentMode: Mode = "holds",
  depth = 0,
  trace?: ExpandTrace[],
): Step[] {
  if (depth > 20) return [{ text: step, mode: parentMode }]; // self-reference guard
  const entry = defs.find(
    (d) => d.kind === "composite" && matchPattern(d.pattern, step) !== null,
  );
  if (!entry) return [{ text: step, mode: parentMode }];

  const params = matchPattern(entry.pattern, step)!;
  const childMode: Mode = entry.mode === "inverted" ? "inverted" : parentMode;
  const out: Step[] = [];
  for (const bodyStep of entry.body) {
    let concrete = bodyStep.replace(KEYWORD, "").trim();
    for (const [k, v] of Object.entries(params)) {
      concrete = concrete.split(`{${k}}`).join(v);
    }
    out.push(...expandSteps(concrete, defs, childMode, depth + 1, trace));
  }
  trace?.push({ from: step, via: entry.pattern, to: out.map((s) => s.text) });
  return out;
}

/** String-only expansion (convenience wrapper); drops mode. */
export function expandStep(
  step: string,
  defs: Definition[],
  depth = 0,
  trace?: ExpandTrace[],
): string[] {
  return expandSteps(step, defs, "holds", depth, trace).map((s) => s.text);
}
