// Authoring-time lint: catch mistakes before a run ever starts.
//
// Composes the purity check (validateDefinitions) with two additional,
// deterministic checks over the whole `.steps` corpus:
//
//   - duplicate pattern: the same kind+pattern defined more than once
//     (whichever definition loads last silently wins at match time —
//     surfaced here instead of discovered by surprise mid-run).
//   - dangling reference: a Composite: body step that resolves to neither
//     a core verb nor another definition's pattern. Left unchecked, this
//     becomes an UNDEFINED step only at drive time, mid-run.
//
// Leaf (`step:`) bodies are not checked for dangling references — a leaf's
// body is an implementation (code fence or a single concrete step), not a
// chain of further references.

import { phaseOf } from "./core.ts";
import { matchPattern } from "./match.ts";
import type { Definition } from "./parse.ts";
import { validateDefinitions, type Violation } from "./validate.ts";

const KEYWORD = /^(Given|When|Then|And|But|\*)\s+/;
const FENCE = /^```/;

export function lintDefinitions(defs: Definition[]): Violation[] {
  const out: Violation[] = [...validateDefinitions(defs)];

  const seen = new Map<string, number>();
  for (const d of defs) {
    const key = `${d.kind}:${d.pattern}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  const flaggedDupes = new Set<string>();
  for (const d of defs) {
    const key = `${d.kind}:${d.pattern}`;
    if ((seen.get(key) ?? 0) > 1 && !flaggedDupes.has(key)) {
      flaggedDupes.add(key);
      out.push({ pattern: d.pattern, message: `duplicate ${d.kind} definition: "${d.pattern}"` });
    }
  }

  for (const d of defs) {
    if (d.kind !== "composite") continue;
    let inFence = false;
    for (const raw of d.body) {
      if (FENCE.test(raw)) {
        inFence = !inFence;
        continue;
      }
      if (inFence) continue;
      const step = raw.replace(KEYWORD, "").trim();
      if (!step) continue;
      const resolvable =
        phaseOf(step) !== null || defs.some((other) => matchPattern(other.pattern, step) !== null);
      if (!resolvable) {
        out.push({
          pattern: d.pattern,
          message: `references undefined step: "${step}" (no core verb or definition matches — add one or fix the wording)`,
        });
      }
    }
  }

  return out;
}
