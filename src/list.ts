// Vocabulary listing: the single source of truth for what the harness can
// say and do — the canonical core verbs plus the project's own
// `features/steps/*.steps` definitions. The agent queries this instead of
// reading the .steps files, so it reuses established patterns and never
// duplicates a definition.

import { listCore } from "./core.ts";
import type { Definition } from "./parse.ts";

export function renderVocabulary(defs: Definition[]): string {
  const out: string[] = [];
  out.push("# core verbs (harness-shipped — compose these, don't redefine)");
  for (const { pattern, phase } of listCore()) {
    out.push(`  ${phase.padEnd(7)} ${pattern}`);
  }
  out.push("");
  out.push(`# project steps (features/steps/*.steps — ${defs.length} definition${defs.length === 1 ? "" : "s"})`);
  for (const d of defs) {
    const tag = d.kind === "composite" ? "composite" : "step";
    out.push(`[${tag}] ${d.pattern}`);
    for (const line of d.body) {
      out.push(`  ${line}`);
    }
  }
  return out.join("\n");
}
