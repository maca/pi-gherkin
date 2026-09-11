# Gherkin-web-qa — dossier

The consolidated record of what this harness is, the decisions that shaped
it, and where it stands. The **harness is the source of truth** (tools +
`features/steps/*.steps`), not this document; unimplemented ideas live in
[`BACKLOG.md`](BACKLOG.md), not in prose.

## The model

**The harness drives, the agent judges.**

- The harness owns everything deterministic: parsing, validation, composite
  expansion, executing steps through agent-browser, recording verdicts, and
  deriving bug status.
- The agent owns only judgement at named stop-points: it receives a
  self-contained prompt (what was performed, the expected step, the observed
  evidence) and returns a verdict. It never simulates a result and never
  derives a status — the harness does both.

This split is the point of the project: an LLM authors runnable Gherkin and
judges evidence honestly; deterministic code owns execution and derivation so
the final status does not depend on the agent's strength or honesty.

## Layout

```
src/            deterministic core (TypeScript, node strip-types)
test/           node:test suite (node --experimental-strip-types --test)
scripts/        CLI drivers (harness = synthetic drill, run = live one-scenario,
                validate-steps = authoring lint)
features/       the corpus: *.feature + steps/*.steps (project vocabulary)
skills/         the skill kit (SKILL.md + fragments)
extension/      gherkin-qa.ts — the committed, symlink-safe pi extension
.pi/extensions/ local symlink to extension/ (gitignored; project-local load)
demo-app/       a two-page app with a seeded bug (the live test target)
scratch/        backlog + old drafts
```

## Core (`src/`) — one module per concern

| module | role |
|---|---|
| `parse.ts` | `.steps` parser → `Definition[]` (kind, pattern, body) |
| `match.ts` | `{placeholder}` pattern matcher |
| `validate.ts` | purity: `Composite:` bodies pure Gherkin; `step:` leaves bodyless |
| `expand.ts` | recursive composite unroll → `Step[]` (text) |
| `core.ts` | the 11 canonical core verbs → agent-browser command renderings |
| `executor.ts` | step → action/observe execution (core verbs, then leaf fallback) |
| `leaf.ts` | code-leaf resolution: ` ```js ` (base64 `agent-browser eval`) / ` ```bash ` (local) |
| `scenario.ts` | run a scenario's `Step[]`, judge at each `Then`, record verdicts |
| `reset.ts` | deterministic per-scenario reset (reopen base URL + clear storage) |
| `ledger.ts` | verdicts → scenario outcomes + `reproduced`/`fixed`/`not-reproduced` + reports |
| `lint.ts` | authoring lint: purity + duplicate patterns + dangling references |
| `list.ts` | vocabulary rendering (the `list_steps` tool's truth) |

## Vocabulary — two definition kinds (`features/steps/*.steps`)

- **`Composite:`** — a pure group of step references, expanded at plan time.
  Body contains *only* step lines (`Given`/`When`/`Then`/`And`/`But`/`*`),
  no code, no `run:`. `{placeholders}` substitute from the matched header.
- **`step:`** — a leaf bound to an implementation channel: a concrete
  already-core step, or a fenced code block. Never has a Gherkin body.

`validateDefinitions` enforces the split at load; a mixed definition is
rejected with a precise violation rather than silently accepted.

### Core verbs (harness-shipped — compose, don't redefine)

| phase | pattern |
|---|---|
| action | `I open the page "{path}"` · `I reload the page` · `I click "{name}"` · `I fill the "{label}" field with "{value}"` · `I press "{key}"` · `I check "{label}"` · `I uncheck "{label}"` · `I select "{value}" in the "{label}" field` |
| observe | `I should see the message "{text}"` · `I should see "{text}"` · `I should be on the "{page}"` |

Visible text, not DOM ids — `I click "Sign In"` matches what a human reads.

## Bug reproduction — `Actual:`/`Expected:` + derivation

A bug-repro is one atomic `Scenario:` ending in a branch tail: one `Actual:`
header and one `Expected:` header, in that order, each followed by exactly
one step, nothing after. This is scenario-tail syntax parsed by the pi
extension itself (`parseFeature` in `extension/gherkin-qa.ts`), not a
`.steps` construct — malformed usage is a parse-time error, not a silent
drop.

`Expected:` is checked **first**, at drive-time. A `success` there
short-circuits the scenario past `Actual:` entirely — it is never driven or
judged. Only when `Expected:` fails (or is skipped) does the harness advance
to `Actual:`. The harness derives status from honest verdicts — the agent
never writes it:

```
fixed          ⇔ Expected: holds                        (Actual: short-circuited)
reproduced     ⇔ Expected: fails ∧ Actual: holds         (bug present, as reported)
not-reproduced ⇔ Expected: fails ∧ Actual: also fails     (report stale)
```

An `error` verdict on either branch yields no status (inconclusive — a
driving failure, not evidence). `bugStatus(records)` (`src/ledger.ts`) keys
on `records.find(r => r.branch === "expected"/"actual")`; a scenario with an
expected-branch record is a bug-repro, otherwise `scenarioVerdict`
(fail > error > skip > success; empty ⇒ skip) applies.

## Tool surface (pi extension, 5 tools)

| tool | availability | role |
|---|---|---|
| `list_steps` | always | vocabulary truth: core verbs + every definition, with bodies |
| `validate_steps` | always | authoring lint (purity, duplicates, dangling refs) |
| `qa_run` | always | parse + validate + expand + drive to first `Then` stop-point |
| `qa_judge` | always | record `success`/`fail`/`skip`/`error` (+ `divergence`) at the current stop-point |
| `qa_abort` | always | discard the in-progress run |

`qa_judge`/`qa_abort` are guardrails but are **always registered and always
active** — deliberately not dynamically activated via `setActiveTools`.
Run state (`pending`) is process-wide module state shared by every session
and subagent, while dynamic tool activation applies only to the session
that calls it and is rebuilt from the base config at session boundaries
(fork/reload/resume/new subagent). That mismatch once stranded agents: a
run left pending by a session that ended blocked every other `qa_run`
("already in progress") while `qa_judge`/`qa_abort` were invisible to
them. Always-on guardrails (clean no-ops when idle) mean any session can
judge or abort; `pending` additionally self-heals via an owner session id
and a last-activity heartbeat — a run idle at a stop-point for >2.5 min is
auto-discarded when a new `qa_run` starts, and the "already in progress"
refusal reports owner/age/step so a live run is never silently clobbered. `onFail` (`stop` | `continue`, default `continue`) controls
whether a `fail` ends the scenario immediately or the harness keeps driving to
record every divergence. `onFail:"stop"` is scenario-scoped, not run-scoped —
it abandons the rest of the current scenario only; other scenarios in the
feature still run. A bug-repro scenario's `Expected:` stop-point is flagged
with an explicit branch hint in the prompt; a `fail` verdict there is exempt
from `onFail:"stop"` unconditionally — it is the normal branch-routing path
into `Actual:`, not a failure.

## Reports — two channels, one ledger

The ledger records at per-`Then` granularity always. Two projections:

- **Agent** (`qa_run` returns it) — `actionable` mode: a header count line +
  blocks *only* for non-success scenarios (fails, errors, skips, and every
  bug-repro), with non-trivial records carrying evidence + divergence.
- **Human** — the full ledger persists as a `qa-run` transcript entry (themed
  renderer: `success`/`fixed` green, `skip`/`not-reproduced` yellow, `fail`/`error`/
  `reproduced` red; expand for the per-step trace), plus a single-line live
  widget ticking scenario/step/state/verdicts. Progress is harness-authored —
  identical regardless of agent strength — and never enters LLM context.

## Between scenarios

A per-scenario reset (reopen base URL + `sessionStorage`/`localStorage`
clear) runs before every scenario after the first; the first scenario's own
`Given` steps establish starting state.

## Corpus

- `features/order.feature` — happy path + unknown-item edge (2 scenarios).
- `features/bug-999.feature` — one atomic bug repro (wrong confirmation text:
  app shows "Honky dory!" where "All good!" is expected).
- `features/steps/` — `auth.steps`, `seed.steps` (the bug repro uses core
  verbs directly in its `Actual:`/`Expected:` tail, no dedicated `.steps` file).
- `demo-app/` — two-page app (`index.html` login → `app.html`), seeded bug.

## Skills

One skill kit (`skills/gherkin-web-qa/`):

- `SKILL.md` — the model, layout, two definition kinds, `Actual:`/`Expected:`,
  core vocab, code-leaf ladder, tool set, report, reset.
- `scenarios.md` — story/scenario authoring (query `list_steps` → reuse →
  one-behavior → extend → `validate_steps` → run).
- `bug-reports.md` — bug → runnable repro (Mode A existing report, Mode B
  proactive), derivation semantics.

The agent-browser command reference lives in the **chrome-headless skill** —
these skills point there rather than reproduce it.

> **Known gap:** the kit is not yet loadable as a pi skill (repo-root
> `skills/` is not a pi discovery location; it wants `.pi/skills/`,
> `.agents/skills/`, a package `skills` entry, or an agentskills.io repo, plus
> frontmatter). See the backlog.

## Key decisions

1. **Deterministic core in `src/`** (TS, node strip-types); the pi extension
   imports those modules directly via jiti — one source of truth, no build.
2. **Harness drives, agent judges** — the agent sees only stop-point prompts
   (expected/evidence, with a branch hint for `Actual:`/`Expected:`) then the
   actionable report; never the raw ledger.
3. **Bug-repro branching is control flow in `drive()`/`qa_judge`, not a
   ledger-only flag** — `StopRecord.branch` (`"actual"`/`"expected"`) tags
   each record so `bugStatus` can derive status, but the short-circuit
   itself (skip `Actual:` when `Expected:` holds) happens at drive-time.
4. **`scenarioOutcome` is the single display source** — summary/trace/actionable
   all label bug-repro scenarios with their bug status, not the raw verdict.
5. **Agent report = `actionable`** — failures and bug-repro scenarios (any
   status) with evidence; successes counted, not detailed.
6. **Branch hint in the stop-point prompt** — an explicit note on `Expected:`
   that a `fail` there is the normal routing path (not a failure), so honest
   `fail`s route to `Actual:` and yield `reproduced` rather than a false
   scenario failure.
7. **Docs are not the truth** — vocabulary is queried via `list_steps`, not
   read from files; unimplemented ideas go in `BACKLOG.md`.
8. **Progress = single-line widget**, human-only, never in LLM context.
9. **`qa-run` entry = data + themed renderer** — durable, human-facing, never
   in LLM context.
10. **Extension is self-contained and committed** — `extension/gherkin-qa.ts`
    resolves `src/` from its own realpath (`import.meta.url` + `realpathSync`)
    and loads the engine via dynamic import, so it works in place, copied, or
    symlinked from any pi extensions directory (jiti resolves relative imports
    against the *symlink* path, which the realpath indirection defeats). The
    project-local `.pi/extensions/gherkin-qa.ts` is a gitignored symlink to it.

## Status

- **77 tests green** (`npm test`); `Actual:`/`Expected:` replaced `[inverted]`
  fully, no backward compat kept.
- **Live end-to-end verified**: `bug-999.feature` → `Expected:` checked first,
  honestly judged `fail` ("All good!" never appeared), short-circuit advanced
  to `Actual:`, judged `success` ("Honky dory!" observed) → derived status
  `reproduced`. Confirmed against a live pi session after `/reload` picked up
  the rewritten extension.
- Unimplemented ideas: see [`BACKLOG.md`](BACKLOG.md).
