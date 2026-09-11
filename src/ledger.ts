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
  /** Which bug-repro branch this record belongs to, if any (see bugStatus). */
  branch?: "actual" | "expected";
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
  mode: "summary" | "trace" | "actionable";
}

export type ScenarioOutcome = Verdict | BugStatus;

/** Bug-aware scenario outcome: bugStatus when the scenario is a bug-repro. */
export function scenarioOutcome(records: StopRecord[]): ScenarioOutcome {
  return bugStatus(records) ?? scenarioVerdict(records);
}

function recordLines(r: StopRecord): string[] {
  const lines = [`  [${r.verdict}] step ${r.stepIndex}: ${r.step}`];
  lines.push(`      evidence: ${r.evidence}`);
  if (r.divergence) lines.push(`      divergence: ${r.divergence}`);
  return lines;
}

const OUTCOME_LABELS: ScenarioOutcome[] = [
  "success",
  "fail",
  "skip",
  "error",
  "reproduced",
  "fixed",
  "not-reproduced",
];

export function report(ledger: RunLedger, opts: ReportOptions): string {
  const byScenario = new Map<string, StopRecord[]>();
  for (const r of ledger.records) {
    if (!byScenario.has(r.scenario)) byScenario.set(r.scenario, []);
    byScenario.get(r.scenario)!.push(r);
  }
  const outcome = (s: string) => scenarioOutcome(byScenario.get(s) ?? []);

  // actionable: header counts + blocks for every non-passing scenario.
  if (opts.mode === "actionable") {
    const parts = OUTCOME_LABELS.filter((o) => ledger.scenarios.some((s) => outcome(s) === o)).map(
      (o) => `${ledger.scenarios.filter((s) => outcome(s) === o).length} ${o}`,
    );
    const lines = [`# ${ledger.scenarios.length} scenarios · ${parts.join(" · ")}`];
    for (const s of ledger.scenarios) {
      if (outcome(s) === "success") continue;
      lines.push(`scenario ${s}  ->  ${outcome(s)}`);
      for (const r of byScenario.get(s) ?? []) {
        const trivial = !r.branch && r.verdict === "success";
        if (!trivial) lines.push(...recordLines(r));
      }
    }
    return lines.join("\n");
  }

  const lines: string[] = [];
  for (const s of ledger.scenarios) {
    const recs = byScenario.get(s) ?? [];
    const o = outcome(s);
    if (opts.mode === "summary") {
      if (o === "fail") {
        const failing = recs.find((r) => r.verdict === "fail");
        lines.push(`${s}  ${o}${failing ? `  (${failing.step})` : ""}`);
      } else {
        lines.push(`${s}  ${o}`);
      }
    } else {
      lines.push(`scenario: ${s}  -> ${o}`);
      for (const r of recs) lines.push(...recordLines(r));
    }
  }
  return lines.join("\n");
}

export function reportJson(ledger: RunLedger): StopRecord[] {
  return ledger.records;
}

/** Bug-repro status for a scenario's records, or null when it isn't one.
 *
 * Derived from the two branch-tagged records, not written by the agent.
 * Expected is checked FIRST (drive-time short-circuit — Actual is skipped
 * once Expected holds), so an actual-branch record exists only when the
 * expected-branch one failed:
 *
 *   fixed          ⇔ expected record holds                  (bug gone)
 *   reproduced     ⇔ expected fails ∧ actual record holds    (bug present, as reported)
 *   not-reproduced ⇔ expected fails ∧ actual also fails      (neither observed — report stale)
 *
 * An `error` verdict on either branch means the judgment is inconclusive
 * (a driving failure, not evidence) — no status is derived.
 */
export type BugStatus = "reproduced" | "fixed" | "not-reproduced";

export function bugStatus(records: StopRecord[]): BugStatus | null {
  const expected = records.find((r) => r.branch === "expected");
  if (!expected) return null;
  if (expected.verdict === "error") return null;
  if (expected.verdict === "success") return "fixed";
  const actual = records.find((r) => r.branch === "actual");
  if (!actual || actual.verdict === "error") return null;
  return actual.verdict === "success" ? "reproduced" : "not-reproduced";
}
