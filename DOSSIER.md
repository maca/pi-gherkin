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
| `parse.ts` | `.steps` parser → `Definition[]` (kind, pattern, body, mode) |
| `match.ts` | `{placeholder}` pattern matcher |
| `validate.ts` | purity: `Composite:` bodies pure Gherkin; `step:` leaves bodyless |
| `expand.ts` | recursive composite unroll → `Step[]` (text + inherited mode) |
| `core.ts` | the 11 canonical core verbs → agent-browser command renderings |
| `executor.ts` | step → action/observe execution (core verbs, then leaf fallback) |
| `leaf.ts` | code-leaf resolution: ` ```js ` (base64 `agent-browser eval`) / ` ```bash ` (local) |
| `scenario.ts` | run a scenario's `Step[]`, judge at each `Then`, record verdicts |
| `reset.ts` | deterministic per-scenario reset (reopen base URL + clear storage) |
| `ledger.ts` | verdicts → scenario outcomes + `reproduced`/`fixed`/`drift` + reports |
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

## Bug reproduction — `[inverted]` + derivation

A bug-repro is one atomic scenario with two `Composite:` branches: an
**actual** branch (must hold — observed reality) and an **expected** branch
marked `[inverted]` (must fail while the bug is present). The flag propagates
recursively through expansion.

The harness derives status from honest verdicts — the agent never writes it:

```
reproduced ⇔ actual holds ∧ inverted diverges   (bug present)
fixed      ⇔ inverted holds                     (bug gone)
drift      ⇔ actual fails                       (report stale)
```

`bugStatus(records)` is tried first; a scenario with any inverted record is a
bug-repro, otherwise `scenarioVerdict` (fail > error > skip > success; empty
⇒ skip) applies.

## Tool surface (pi extension, 5 tools)

| tool | availability | role |
|---|---|---|
| `list_steps` | always | vocabulary truth: core verbs + every definition, bodies, `[inverted]` |
| `validate_steps` | always | authoring lint (purity, duplicates, dangling refs) |
| `qa_run` | always | parse + validate + expand + drive to first `Then` stop-point |
| `qa_judge` | mid-run | record `success`/`fail`/`skip`/`error` (+ `divergence`) |
| `qa_abort` | mid-run | discard the in-progress run |

`qa_judge`/`qa_abort` are **guardrails** (active only mid-run, like pi-magit's
rebase tools). `onFail` (`stop` | `continue`, default `continue`) controls
whether a `fail` ends the scenario immediately or the harness keeps driving to
record every divergence. An inverted stop-point is flagged with an explicit
plain-language hint: *"this branch is EXPECTED to fail while the bug is
present."*

## Reports — two channels, one ledger

The ledger records at per-`Then` granularity always. Two projections:

- **Agent** (`qa_run` returns it) — `actionable` mode: a header count line +
  blocks *only* for non-success scenarios (fails, errors, skips, and every
  bug-repro), with non-trivial records carrying evidence + divergence.
- **Human** — the full ledger persists as a `qa-run` transcript entry (themed
  renderer: `success`/`fixed` green, `skip`/`drift` yellow, `fail`/`error`/
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
- `features/steps/` — `auth.steps`, `seed.steps`, `bug999.steps` (6 definitions).
- `demo-app/` — two-page app (`index.html` login → `app.html`), seeded bug.

## Skills

One skill kit (`skills/gherkin-web-qa/`):

- `SKILL.md` — the model, layout, two definition kinds, `[inverted]`, core
  vocab, code-leaf ladder, tool set, report, reset.
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
   (expected/evidence, with inverted hint) then the actionable report; never
   the raw ledger.
3. **`runScenario` takes `Step[]` only** — records carry `step.mode`, so
   bug-status derivation sees which steps were checked-but-inverted.
4. **`scenarioOutcome` is the single display source** — summary/trace/actionable
   all label bug-repro scenarios with their bug status, not the raw verdict.
5. **Agent report = `actionable`** — failures/bugs/drift with evidence;
   successes counted, not detailed.
6. **`[inverted]` in the stop-point prompt** — an explicit hint that the
   branch is expected to fail while the bug is present, so honest `fail`s
   yield `reproduced` rather than a false scenario failure.
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

- **83 tests green** (12 test files); `validate-steps` clean (6 defs, 3 files).
- **Live end-to-end verified**: `bug-999.feature` → `reproduced` (inverted
  branch honestly judged `fail`); `order.feature` → `2 success` across a
  per-scenario reset; widget + themed entry renderer confirmed in a real
  session.
- Unimplemented ideas: see [`BACKLOG.md`](BACKLOG.md).
