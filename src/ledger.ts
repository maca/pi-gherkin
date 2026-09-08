// Run ledger: verdict records + report projection.
//
// The runner always records at per-Then granularity (evidence is cheap to
// capture, expensive to lose). The report is a projection over those records:
//   summary  -> one line per scenario (verdict [+ first failing step])
//   trace    -> one block per record (step, verdict, evidence, divergence)
// The granularity is a *report* toggle, not a capture toggle.

export type Verdict = "success" | "fail" | "skip" | "error";

export interface StopRecord {
  scenario: string;
  stepIndex: number;
  step: string;
  verdict: Verdict;
  /** Observed evidence quoted at the stop-point. */
  evidence: string;
  /** Expected-vs-observed divergence on a fail. */
  divergence?: string;
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
