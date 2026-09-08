// Purity validator: enforce the planning/driving split.
//
//   Composite: body must contain ONLY step references (Gherkin steps).
//              run: ops and code fences belong to leaves, not groups.
//   step:      leaf body must not contain Gherkin step lines (a leaf with a
//              Gherkin body should be a Composite:).
//
// This is a deterministic guardrail: a `.steps` file is either pure (groups
// are expandable text, leaves carry implementation channels) or it is
// rejected with a precise violation.

import type { Definition } from "./parse.ts";

export interface Violation {
  pattern: string;
  message: string;
}

const GHERKIN = /^(Given|When|Then|And|But|\*)\s/;
const FENCE = /^```/;

export function validateDefinitions(defs: Definition[]): Violation[] {
  const out: Violation[] = [];
  for (const d of defs) {
    const hasFence = d.body.some((b) => FENCE.test(b));
    const hasRun = d.body.some((b) => b.toLowerCase().startsWith("run:"));
    const hasSteps = d.body.some((b) => GHERKIN.test(b));
    if (d.kind === "composite") {
      if (hasFence || hasRun) {
        out.push({
          pattern: d.pattern,
          message: "Composite body must contain only steps (no run: ops or code fences)",
        });
      }
      if (d.body.length === 0) {
        out.push({ pattern: d.pattern, message: "Composite has an empty body" });
      }
    } else {
      if (d.mode === "inverted") {
        out.push({
          pattern: d.pattern,
          message: "[inverted] is only valid on Composite: (leaves are concrete, not branches)",
        });
      }
      if (hasSteps) {
        out.push({
          pattern: d.pattern,
          message: "Leaf has a Gherkin body — use Composite: instead",
        });
      }
    }
  }
  return out;
}
