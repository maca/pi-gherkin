// Run ledger: verdict records + report projection.
//
// The runner always records at per-Then granularity (evidence is cheap to
// capture, expensive to lose). The report is a projection over those records:
//   summary  -> one line per scenario (verdict [+ first failing step])
//   trace    -> one block per record (step, verdict, evidence, divergence)
// The granularity is a *report* toggle, not a capture toggle.

export type Verdict = "success" | "fail" | "skip" | "error";

import type { Mode } from "./parse.ts";

export interface StopRecord {
  scenario: string;
  stepIndex: number;
  step: string;
  verdict: Verdict;
  /** Observed evidence quoted at the stop-point. */
  evidence: string;
  /** Expected-vs-observed divergence on a fail. */
  divergence?: string;
  /** Checking mode: holds (default) or inverted (expected to fail). */
  mode?: Mode;
}

export interface RunLedger {
  scenarios: string[];
  records: StopRecord[];
}

// fail beats error beats skip beats success
const PRECEDENCE: Verdict[] = ["fail", "error", "skip", "success"];

export function scenarioVerdict(records: StopRecord[]): Verdict {
  if (records.length === 0) return "skip"; // never evaluated
  const seen = new Set(records.map((r) => r.verdict));
  for (const v of PRECEDENCE) if (seen.has(v)) return v;
  return "success";
}

export interface ReportOptions {
  mode: "summary" | "trace";
}

export function report(ledger: RunLedger, opts: ReportOptions): string {
  const byScenario = new Map<string, StopRecord[]>();
  for (const r of ledger.records) {
    if (!byScenario.has(r.scenario)) byScenario.set(r.scenario, []);
    byScenario.get(r.scenario)!.push(r);
  }
  const lines: string[] = [];
  for (const s of ledger.scenarios) {
    const recs = byScenario.get(s) ?? [];
    const verdict = scenarioVerdict(recs);
    if (opts.mode === "summary") {
      const failing = recs.find((r) => r.verdict === "fail");
      lines.push(`${s}  ${verdict}${failing ? `  (${failing.step})` : ""}`);
    } else {
      lines.push(`scenario: ${s}  -> ${verdict}`);
      for (const r of recs) {
        lines.push(`  [${r.verdict}] step ${r.stepIndex}: ${r.step}`);
        lines.push(`      evidence: ${r.evidence}`);
        if (r.divergence) lines.push(`      divergence: ${r.divergence}`);
      }
    }
  }
  return lines.join("\n");
}

export function reportJson(ledger: RunLedger): StopRecord[] {
  return ledger.records;
}

/** Bug-repro status for a scenario's records, or null when it isn't one.
 *
 *   reproduced ⇔ actual holds ∧ inverted diverges   (claims correct: bug present)
 *   fixed      ⇔ inverted holds                     (claims correct: bug gone)
 *   drift      ⇔ actual fails                       (claims wrong: report stale)
 */
export type BugStatus = "reproduced" | "fixed" | "drift";

export function bugStatus(records: StopRecord[]): BugStatus | null {
  const inverted = records.filter((r) => r.mode === "inverted");
  if (inverted.length === 0) return null;
  const actualFail = records.some(
    (r) => r.mode !== "inverted" && (r.verdict === "fail" || r.verdict === "error"),
  );
  if (actualFail) return "drift";
  if (inverted.some((r) => r.verdict === "success")) return "fixed";
  return "reproduced";
}
