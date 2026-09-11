// gherkin-qa — pi extension exposing the Gherkin QA harness as guardrail tools.
//
// Model: harness drives, agent judges. qa_run parses+validates+expands a
// feature, then drives agent-browser action-by-action until it reaches a Then
// stop-point; it returns a self-contained assessment prompt (expected step +
// observed evidence, with a branch hint for a bug-repro scenario's tail
// Actual:/Expected: check). The agent calls qa_judge with its verdict, and
// the harness records it and drives to the next stop — short-circuiting
// Actual once Expected holds, and abandoning only the current scenario (not
// the whole run) on a real failure.
//
// Progress is harness-authored: a single-line widget ticks as the drive loop
// advances (human-only, never in LLM context). At the end the agent receives
// the *actionable* report (failures, bugs, drift — with evidence); the full
// ledger is persisted as a `qa-run` transcript entry for the human.
//
// Tools: list_steps/validate_steps/qa_run/qa_judge/qa_abort — all five are
// always registered AND always active. qa_judge/qa_abort no-op cleanly when
// no run is pending.
//
// Deliberately no dynamic activation via setActiveTools. Run state (pending)
// is process-wide module state shared by every session/subagent, while
// setActiveTools applies only to the agent session that calls it and is
// rebuilt from the base config at every session boundary (fork/reload/resume/
// new subagent). Dynamically-activated guardrails therefore vanished for any
// session that did not itself start the run, stranding it: qa_run blocked by
// the shared pending, but qa_judge/qa_abort uncallable. Always-on guardrails
// make judging/aborting possible from any session; pending additionally
// self-heals (owner + last-activity heartbeat, stale-run auto-discard in
// qa_run) so a run whose owning session died cannot wedge the queue.
//
// Self-contained: this file resolves the harness src/ from its own real
// location (via import.meta.url + realpath), so it loads identically whether
// it is used in place, copied, or symlinked from a pi extensions directory.

import { exec } from "node:child_process";
import { readFileSync, readdirSync, existsSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { StringEnum } from "@earendil-works/pi-ai";
import { Box, Text } from "@earendil-works/pi-tui";

// Type-only (erased at load — never resolved at runtime).
import type { Definition } from "../../src/parse.ts";
import type { Step } from "../../src/expand.ts";
import type { Runner } from "../../src/executor.ts";
import type { RunLedger, Verdict } from "../../src/ledger.ts";

// The harness src/ sits beside this file's checkout (sibling of extension/).
const SRC = join(dirname(realpathSync(fileURLToPath(import.meta.url))), "..", "src");

const WIDGET_ID = "gherkin-qa";
/** A stop-point left unjudged longer than this is treated as abandoned. */
const RUN_STALE_MS = 150_000;

interface ScenarioPlan {
  name: string;
  /** Expanded concrete steps (the scenario's linear body). */
  steps: Step[];
  /** Bug-repro branch tail: Actual:/Expected:, each exactly one concrete step. */
  actual?: Step;
  expected?: Step;
}

interface StopPoint {
  index: number;
  step: string;
  /** Which bug-repro branch this stop belongs to, if any. */
  branch?: "actual" | "expected";
  evidence: string;
  code: number;
}

interface PendingRun {
  feature: string;
  scenarios: ScenarioPlan[];
  scenarioIndex: number;
  cursor: number;
  stop: StopPoint | null;
  ledger: RunLedger;
  onFail: "stop" | "continue";
  baseUrl: string;
  /** step: leaf definitions, tried when a step matches no core verb. */
  defs: Definition[];
  /** Session id that started the run ("unknown" when unavailable). */
  owner: string;
  startedAt: number;
  /** Touched at every stop-point/verdict; staleness = now - lastActivity. */
  lastActivity: number;
}

interface QaRunEntryData {
  feature: string;
  ledger: RunLedger;
}

function outcomeColor(o: string): "success" | "error" | "warning" {
  if (o === "success" || o === "fixed") return "success";
  if (o === "skip" || o === "not-reproduced") return "warning";
  return "error"; // fail, error, reproduced
}

/** "12s" / "3m 5s" — elapsed wall-clock since the given ms timestamp. */
function fmtAge(ms: number): string {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

let pending: PendingRun | null = null;

interface Ui {
  setWidget: (id: string, v: unknown) => void;
}

/** Colored, single-line widget: state (driving/judging) + running verdict tally. */
function widgetRenderer(pr: PendingRun, extra?: string) {
  return (_tui: unknown, theme: any) => {
    const sc = pr.scenarios[pr.scenarioIndex];
    const state = pr.stop
      ? `${theme.fg("warning", "judging")} @${pr.cursor + 1}`
      : `${theme.fg("accent", "driving")} ${pr.cursor + 1}/${sc.steps.length}`;
    const line =
      `${theme.fg("accent", "qa-run")} ${pr.scenarioIndex + 1}/${pr.scenarios.length} "${sc.name}" · ${state} · ` +
      `${theme.fg("dim", `verdicts ${pr.ledger.records.length}`)}` +
      (extra ? ` · ${theme.fg("dim", extra)}` : "");
    return { render: () => [line], invalidate: () => {} };
  };
}

function paint(pr: PendingRun | null, ui: unknown, extra?: string): void {
  try {
    const u = ui as Ui | undefined;
    if (!u || typeof u.setWidget !== "function") return;
    u.setWidget(WIDGET_ID, pr ? widgetRenderer(pr, extra) : undefined);
  } catch {
    /* ui unavailable (print/json modes) */
  }
}

export default async function (pi: ExtensionAPI) {
  // Load the harness engine from beside this file (works under any link).
  const { parseDefinitions } = await import(`${SRC}/parse.ts`);
  const { validateDefinitions } = await import(`${SRC}/validate.ts`);
  const { lintDefinitions } = await import(`${SRC}/lint.ts`);
  const { expandSteps } = await import(`${SRC}/expand.ts`);
  const { executeStep } = await import(`${SRC}/executor.ts`);
  const { resetCommands } = await import(`${SRC}/reset.ts`);
  const { report, scenarioOutcome } = await import(`${SRC}/ledger.ts`);
  const { renderVocabulary } = await import(`${SRC}/list.ts`);

  // ---- state lifecycle ---------------------------------------------------

  // A main-session lifecycle boundary (startup/new/fork/resume/reload/
  // shutdown) means the previous conversation — and any run it owned — is
  // gone; clear the shared state so a fresh session starts unblocked. Note:
  // background agent sessions do not fire these events, which is exactly why
  // stale-run recovery below (qa_run auto-discard) also exists.
  const reset = (ui?: unknown) => {
    pending = null;
    paint(null, ui);
  };
  pi.on("session_start", (_event, ctx) => reset(ctx.ui));
  pi.on("session_shutdown", (_event, ctx) => reset(ctx.ui));

  // ---- helpers -----------------------------------------------------------

  const loadDefs = (cwd: string) => {
    const dir = join(cwd, "features", "steps");
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((f) => f.endsWith(".steps"))
      .flatMap((f) => parseDefinitions(readFileSync(join(dir, f), "utf8")));
  };

  interface RawScenario {
    name: string;
    raw: string[];
    actual?: string;
    expected?: string;
  }

  const STEP_LINE = /^\s*(Given|When|Then|And|But|\*)\s+(.+)$/;
  const ACTUAL_HDR = /^\s*Actual:\s*$/;
  const EXPECTED_HDR = /^\s*Expected:\s*$/;

  // Actual:/Expected: is a scenario-tail bug-repro branch — not a standard
  // Gherkin construct (there isn't one). The harness checks Expected FIRST,
  // short-circuiting Actual on success (bug considered fixed); only when
  // Expected fails does it check Actual, to confirm the bug as reported.
  // Exactly one pair, one step each, nothing after — malformed usage is a
  // hard parse error (not a silent drop, which used to be the trap).
  const parseFeature = (text: string): RawScenario[] => {
    const out: RawScenario[] = [];
    let cur: RawScenario | null = null;
    let state: "body" | "afterActual" | "afterActualStep" | "afterExpected" | "done" = "body";
    const fail = (msg: string): never => {
      throw new Error(`Feature parse error in scenario "${cur?.name ?? "?"}": ${msg}`);
    };
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      const sc = /^\s*Scenario:\s*(.+)$/.exec(line);
      if (sc) {
        if (cur && state !== "body" && state !== "done") fail("incomplete Actual:/Expected: block");
        cur = { name: sc[1].trim(), raw: [] };
        out.push(cur);
        state = "body";
        continue;
      }
      if (!cur) continue;
      if (state === "body") {
        if (ACTUAL_HDR.test(line)) {
          state = "afterActual";
          continue;
        }
        if (EXPECTED_HDR.test(line)) fail("Expected: without a preceding Actual:");
        const m = STEP_LINE.exec(line);
        if (m) cur.raw.push(m[2].trim());
        continue;
      }
      if (state === "afterActual") {
        const m = STEP_LINE.exec(line);
        if (!m) fail("Actual: must be followed by exactly one step");
        cur.actual = m![2].trim();
        state = "afterActualStep";
        continue;
      }
      if (state === "afterActualStep") {
        if (!EXPECTED_HDR.test(line)) fail("Actual: must be immediately followed by Expected:");
        state = "afterExpected";
        continue;
      }
      if (state === "afterExpected") {
        const m = STEP_LINE.exec(line);
        if (!m) fail("Expected: must be followed by exactly one step");
        cur.expected = m![2].trim();
        state = "done";
        continue;
      }
      if (state === "done") fail("no steps allowed after Actual:/Expected:");
    }
    if (cur && state !== "body" && state !== "done") fail("incomplete Actual:/Expected: block");
    return out;
  };

  const makeRunner = (cwd: string): Runner => (cmd) =>
    new Promise((res) => {
      exec(cmd, { timeout: 30000, cwd }, (err, stdout, stderr) => {
        const code = err ? (typeof err.code === "number" ? err.code : 1) : 0;
        res({ code, stdout, stderr });
      });
    });

  const currentScenario = (pr: PendingRun) => pr.scenarios[pr.scenarioIndex];

  /** The concrete step at pr.cursor: linear body, then Expected, then Actual. */
  const stepAt = (
    sc: ScenarioPlan,
    cursor: number,
  ): { step: Step; branch?: "actual" | "expected" } | null => {
    if (cursor < sc.steps.length) return { step: sc.steps[cursor] };
    if (cursor === sc.steps.length && sc.expected) return { step: sc.expected, branch: "expected" };
    if (cursor === sc.steps.length + 1 && sc.actual) return { step: sc.actual, branch: "actual" };
    return null;
  };

  // Move to the next scenario, resetting browser state between scenarios.
  // Scenario-scoped: abandoning the current scenario (a real failure, or a
  // short-circuited Expected) never ends the run — only running out of
  // scenarios does.
  const advanceScenario = async (pr: PendingRun, runner: Runner, baseUrl: string): Promise<void> => {
    const name = currentScenario(pr).name;
    pr.scenarioIndex++;
    pr.cursor = 0;
    // Reset between scenarios (not before the first — its own Given steps
    // establish the starting state) so one scenario's leftover state (still
    // logged in, stale storage) cannot leak into the next.
    if (pr.scenarioIndex > 0 && pr.scenarioIndex < pr.scenarios.length) {
      for (const cmd of resetCommands(baseUrl)) {
        const res = await runner(cmd);
        if (res.code !== 0) {
          pr.ledger.records.push({
            scenario: name,
            stepIndex: -1,
            step: "(scenario reset)",
            verdict: "error",
            evidence: res.stderr || res.stdout || `exit ${res.code}`,
          });
          return;
        }
      }
    }
  };

  // Drive until the next stop-point or the end of the run. A real failure
  // (execution error, or a plain fail under onFail:"stop") abandons only the
  // current scenario and moves on — the run itself only ends when scenarios
  // run out (see advanceScenario).
  const drive = async (pr: PendingRun, runner: Runner, baseUrl: string, ui: unknown): Promise<string> => {
    const performed: string[] = [];
    while (pr.scenarioIndex < pr.scenarios.length) {
      const sc = currentScenario(pr);
      const at = stepAt(sc, pr.cursor);
      if (!at) {
        await advanceScenario(pr, runner, baseUrl);
        continue;
      }
      const { step, branch } = at;
      const out = await executeStep(step.text, { run: runner, baseUrl, defs: pr.defs }, pr.cursor);
      switch (out.kind) {
        case "action":
          performed.push(out.step);
          pr.cursor++;
          paint(pr, ui);
          continue;
        case "observe": {
          pr.stop = { index: out.index, step: out.step, branch, evidence: out.evidence, code: out.code };
          pr.lastActivity = Date.now();
          paint(pr, ui, "waiting for judgement");
          return stopReport(pr, performed);
        }
        case "undefined":
        case "error": {
          pr.ledger.records.push({
            scenario: sc.name,
            stepIndex: pr.cursor,
            step: out.step,
            verdict: "error",
            evidence: out.kind === "error" ? out.error : "",
            divergence: out.kind === "undefined" ? "no core verb or definition" : undefined,
            branch,
          });
          await advanceScenario(pr, runner, baseUrl);
          continue;
        }
      }
    }
    return finish(pr, performed, ui);
  };

  const stopReport = (pr: PendingRun, performed: string[]): string => {
    const sc = currentScenario(pr);
    const s = pr.stop!;
    const branchHint =
      s.branch === "expected"
        ? `\n  branch: expected — checked FIRST. success -> bug considered fixed, Actual is skipped. fail/skip -> harness checks Actual next. A fail here is the normal, expected outcome while the bug is present, not a run failure.`
        : s.branch === "actual"
          ? `\n  branch: actual — reached because Expected did not hold. success -> bug reproduced as reported. fail -> neither Expected nor Actual held (not reproduced as reported).`
          : "";
    return [
      `STOP-POINT  scenario ${pr.scenarioIndex + 1}/${pr.scenarios.length}: "${sc.name}"  (step ${s.index + 1})`,
      performed.length ? `  performed: ${performed.join(" -> ")}` : "",
      `  expected: ${s.step}`,
      `  evidence: ${JSON.stringify(s.evidence)}   (exit ${s.code})`,
      branchHint,
      "",
      `Call qa_judge with your verdict (success|fail|skip|error). On fail, add the divergence.`,
    ]
      .filter(Boolean)
      .join("\n");
  };

  const finish = (pr: PendingRun, performed: string[], ui: unknown): string => {
    pr.stop = null;
    pending = null;
    paint(null, ui);
    // Persist the full ledger for the human (durable, not in LLM context).
    pi.appendEntry<QaRunEntryData>("qa-run", { feature: pr.feature, ledger: pr.ledger });
    const text =
      "RUN COMPLETE\n\n" + report(pr.ledger, { mode: "actionable" });
    return text;
  };

  // ---- entry renderer (human-facing, TUI-only, never in LLM context) ----

  pi.registerEntryRenderer<QaRunEntryData>("qa-run", (entry, { expanded }, theme) => {
    const data = entry.data;
    if (!data) return new Text(theme.fg("dim", "qa-run: (no data)"));
    const byScenario = new Map<string, typeof data.ledger.records>();
    for (const r of data.ledger.records) {
      if (!byScenario.has(r.scenario)) byScenario.set(r.scenario, []);
      byScenario.get(r.scenario)!.push(r);
    }
    const counts = new Map<string, number>();
    for (const s of data.ledger.scenarios) {
      const o = scenarioOutcome(byScenario.get(s) ?? []);
      counts.set(o, (counts.get(o) ?? 0) + 1);
    }
    const header = [...counts.entries()].map(([o, n]) => `${n} ${o}`).join(" · ");

    const box = new Box(1, 1, (text) => theme.bg("customMessageBg", text));
    box.addChild(new Text(`${theme.fg("accent", "[qa-run]")} ${data.feature}  —  ${header}`, 0, 0));
    for (const s of data.ledger.scenarios) {
      const recs = byScenario.get(s) ?? [];
      const o = scenarioOutcome(recs);
      box.addChild(new Text(`  ${theme.fg(outcomeColor(o), o.padEnd(10))} ${s}`, 0, 0));
      if (expanded) {
        for (const r of recs) {
          box.addChild(new Text(theme.fg("dim", `      [${r.verdict}] step ${r.stepIndex}: ${r.step}`), 0, 0));
          box.addChild(new Text(theme.fg("dim", `          evidence: ${r.evidence}`), 0, 0));
          if (r.divergence) {
            box.addChild(new Text(theme.fg("dim", `          divergence: ${r.divergence}`), 0, 0));
          }
        }
      }
    }
    return box;
  });

  // ---- tools -------------------------------------------------------------

  pi.registerTool({
    name: "list_steps",
    label: "List steps",
    description:
      "List the harness's step vocabulary — the canonical core verbs plus every features/steps/*.steps " +
      "definition (Composite: groups and step: leaves, with bodies). Query this before " +
      "authoring a feature or adding a definition so you reuse existing patterns instead of duplicating them. " +
      "Always available, independent of qa_run.",
    parameters: Type.Object({}),
    async execute(_id, _params, _signal, _onUpdate, ctx) {
      const defs = loadDefs(ctx.cwd);
      return { content: [{ type: "text", text: renderVocabulary(defs) }] };
    },
  });

  pi.registerTool({
    name: "validate_steps",
    label: "Validate steps",
    description:
      "Lint features/steps/*.steps before running anything: purity (Composite: bodies must be pure step " +
      "references, step: leaves must not have a Gherkin body), duplicate pattern definitions, and Composite: " +
      "body steps that resolve to neither a core verb nor another definition (dangling references, which would " +
      "otherwise surface only as UNDEFINED mid-run). Always available, independent of qa_run.",
    parameters: Type.Object({}),
    async execute(_id, _params, _signal, _onUpdate, ctx) {
      const defs = loadDefs(ctx.cwd);
      if (defs.length === 0) {
        return { content: [{ type: "text", text: "no .steps definitions found under features/steps/" }] };
      }
      const violations = lintDefinitions(defs);
      const header = `checked ${defs.length} definitions`;
      if (violations.length === 0) {
        return { content: [{ type: "text", text: `${header}\nclean — no violations` }] };
      }
      const lines = violations.map((v) => `  !! ${v.pattern} — ${v.message}`);
      return {
        content: [{ type: "text", text: `${header}\n${lines.join("\n")}` }],
        details: { violations: violations.length },
      };
    },
  });

  pi.registerTool({
    name: "qa_run",
    label: "QA run",
    description:
      "Run a Gherkin feature against the live app via agent-browser (requires chrome-ctl start + the app served). " +
      "Parses, validates, and expands the feature, then drives actions until the first Then stop-point and returns an " +
      "assessment prompt (expected step + observed evidence; a bug-repro scenario's Actual:/Expected: branch is flagged). " +
      "Judge each stop-point with qa_judge. " +
      "A single run is enforced process-wide; qa_judge/qa_abort are always available to judge or discard it. A run left idle " +
      "at a stop-point for >2.5 min is treated as abandoned and auto-discarded when a new qa_run starts.",
    parameters: Type.Object({
      feature: Type.Optional(Type.String({ description: "Path to .feature, default features/order.feature" })),
      baseUrl: Type.Optional(Type.String({ description: "App base URL, default http://127.0.0.1:8099/" })),
      onFail: Type.Optional(StringEnum(["stop", "continue"] as const)),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const owner = ctx.sessionManager?.getSessionId?.() ?? "unknown";
      let discarded: string | null = null;
      if (pending) {
        const idleMs = Date.now() - pending.lastActivity;
        const stuck = pending.stop
          ? `awaiting qa_judge at "${currentScenario(pending).name}" step ${pending.stop.index + 1}`
          : `driving "${currentScenario(pending).name}"`;
        if (idleMs < RUN_STALE_MS) {
          return {
            content: [{
              type: "text",
              text: [
                "A run is already in progress.",
                `  feature: ${pending.feature}`,
                `  owner: ${pending.owner}  (started ${fmtAge(pending.startedAt)} ago, last activity ${fmtAge(pending.lastActivity)} ago)`,
                `  status: ${stuck}`,
                "",
                "qa_judge/qa_abort are always available: judge the pending stop-point, or call qa_abort to discard this run.",
                `A run idle for more than ${RUN_STALE_MS / 1000}s is auto-discarded when a new qa_run starts.`,
              ].join("\n"),
            }],
            details: { error: true },
          };
        }
        discarded = `Discarded stale run started by ${pending.owner} ${fmtAge(pending.startedAt)} ago (idle ${fmtAge(pending.lastActivity)} at ${stuck}).`;
        pending = null;
        paint(null, ctx.ui);
      }
      const head = discarded ? `NOTE: ${discarded}\n\n` : "";
      const featurePath = join(ctx.cwd, params.feature ?? "features/order.feature");
      const baseUrl = params.baseUrl ?? "http://127.0.0.1:8099/";
      const onFail = params.onFail ?? "continue";
      if (!existsSync(featurePath)) {
        return { content: [{ type: "text", text: `${head}feature not found: ${featurePath}` }], details: { error: true } };
      }
      const defs = loadDefs(ctx.cwd);
      const violations = validateDefinitions(defs);
      let rawScenarios: Array<{ name: string; raw: string[]; actual?: string; expected?: string }>;
      try {
        rawScenarios = parseFeature(readFileSync(featurePath, "utf8"));
      } catch (err: any) {
        return { content: [{ type: "text", text: `${head}${err.message}` }], details: { error: true } };
      }
      // Actual:/Expected: must resolve to exactly one concrete (observe) step
      // each — a composite expanding to more than one step, or to an action,
      // is a hard error rather than a silently mis-shaped branch.
      const expandOne = (raw: string, scenarioName: string, label: string): Step => {
        const expanded = expandSteps(raw, defs);
        if (expanded.length !== 1) {
          throw new Error(
            `${label}: in scenario "${scenarioName}" must resolve to exactly one step (got ${expanded.length}) — "${raw}"`,
          );
        }
        return expanded[0];
      };
      let scenarios: ScenarioPlan[];
      try {
        scenarios = rawScenarios.map((sc) => ({
          name: sc.name,
          steps: sc.raw.flatMap((s) => expandSteps(s, defs)),
          actual: sc.actual ? expandOne(sc.actual, sc.name, "Actual") : undefined,
          expected: sc.expected ? expandOne(sc.expected, sc.name, "Expected") : undefined,
        }));
      } catch (err: any) {
        return { content: [{ type: "text", text: `${head}${err.message}` }], details: { error: true } };
      }
      if (scenarios.length === 0) {
        return { content: [{ type: "text", text: `${head}no scenarios found in feature` }], details: { error: true } };
      }
      pending = {
        feature: featurePath,
        scenarios,
        scenarioIndex: 0,
        cursor: 0,
        stop: null,
        ledger: { scenarios: scenarios.map((s) => s.name), records: [] },
        onFail,
        baseUrl,
        defs,
        owner,
        startedAt: Date.now(),
        lastActivity: Date.now(),
      };
      paint(pending, ctx.ui);
      const reportText = await drive(pending, makeRunner(ctx.cwd), baseUrl, ctx.ui);
      if (violations.length) {
        const vtxt = violations.map((v) => `  !! ${v.pattern} — ${v.message}`).join("\n");
        return { content: [{ type: "text", text: `WARN: ${violations.length} step-def violations:\n${vtxt}\n\n${head}${reportText}` }] };
      }
      return { content: [{ type: "text", text: head + reportText }] };
    },
  });

  pi.registerTool({
    name: "qa_judge",
    label: "QA judge",
    description:
      "Record your verdict at the current stop-point of an in-progress qa_run, then continue driving to the next stop-point or the final report.",
    promptGuidelines: [
      "Use qa_judge to answer a STOP-POINT from qa_run: judge whether the expected step holds given the evidence, and pass success/fail/skip/error. " +
        "For a bug-repro scenario's Expected: branch (checked first), a fail is the normal, expected outcome while the bug is present — not a run failure; the harness then checks Actual: to confirm the bug as reported.",
    ],
    parameters: Type.Object({
      verdict: StringEnum(["success", "fail", "skip", "error"] as const),
      divergence: Type.Optional(Type.String({ description: "expected vs observed, when failing" })),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      if (!pending) {
        return { content: [{ type: "text", text: "No run in progress. Call qa_run first." }], details: { error: true } };
      }
      if (!pending.stop) {
        return { content: [{ type: "text", text: "No stop-point pending (run already finished?)." }], details: { error: true } };
      }
      const sc = currentScenario(pending);
      const s = pending.stop;
      const verdict = params.verdict as Verdict;
      pending.ledger.records.push({
        scenario: sc.name,
        stepIndex: s.index,
        step: s.step,
        verdict,
        evidence: s.evidence,
        divergence: params.divergence,
        branch: s.branch,
      });
      pending.lastActivity = Date.now();
      pending.stop = null;

      const runner = makeRunner(ctx.cwd);

      if (verdict === "error") {
        // A real driving/judgement failure abandons this scenario, never the
        // whole run — other scenarios still get driven.
        await advanceScenario(pending, runner, pending.baseUrl);
      } else if (s.branch === "expected") {
        if (verdict === "success") {
          // Expected holds: bug considered fixed. Short-circuit — Actual is
          // never checked, it would just be re-observing the same state.
          await advanceScenario(pending, runner, pending.baseUrl);
        } else {
          // fail or skip: proceed to check Actual next, in the same scenario.
          // A fail here is never a halt signal (onFail or not) — it's the
          // normal path into the reproduction check.
          pending.cursor = s.index + 1;
        }
      } else if (s.branch === "actual") {
        // Resolved either way (reproduced / not-reproduced) — nothing left in
        // this scenario's branch tail.
        await advanceScenario(pending, runner, pending.baseUrl);
      } else if (verdict === "fail" && pending.onFail === "stop") {
        // Plain (non-branch) stop-point: onFail:"stop" abandons the rest of
        // THIS scenario only — other scenarios in the run still get driven.
        await advanceScenario(pending, runner, pending.baseUrl);
      } else {
        pending.cursor = s.index + 1;
      }
      const reportText = await drive(pending, runner, pending.baseUrl, ctx.ui);
      return { content: [{ type: "text", text: reportText }] };
    },
  });

  pi.registerTool({
    name: "qa_abort",
    label: "QA abort",
    description:
      "Abort/discard the in-progress run and its state (no report). Always available — also the recovery path when qa_run " +
      "reports a run already in progress (e.g. one started by a session that ended); discarding is safe, the run can simply " +
      "be started again.",
    parameters: Type.Object({}),
    async execute(_id, _params, _signal, _onUpdate, ctx) {
      if (!pending) {
        return { content: [{ type: "text", text: "No run in progress." }], details: { error: true } };
      }
      const n = pending.ledger.records.length;
      pending = null;
      paint(null, ctx.ui);
      return { content: [{ type: "text", text: `Run aborted (${n} verdicts discarded).` }] };
    },
  });
}
