---
name: gherkin-web-qa
description: |
  Author and run Gherkin feature files against a live web app through
  agent-browser, with deterministic harness tools (list_steps, validate_steps,
  qa_run, qa_judge, qa_abort) and an LLM agent that authors scenarios and
  judges evidence at stop-points. Covers story/scenario authoring (scenarios.md)
  and turning bugs into runnable reproductions with Actual:/Expected: branches
  (bug-reports.md). Trigger phrases: "write a feature test", "run this scenario
  live", "reproduce this bug in Gherkin", "what steps does the harness know".
---

# Gherkin web QA — author and run

Write runnable Gherkin against a live web app and drive it through
agent-browser, with an LLM agent authoring/judging and this harness owning
execution and derivation. The model throughout: **the harness drives, the
agent judges** — you never simulate a command result, you only judge the
evidence the harness hands you at a stop-point.

Use this skill whenever you're asked to write a feature test, run one
live, or turn a bug into a runnable reproduction (see `bug-reports.md` in
this directory for the bug-repro workflow specifically).

## Prerequisites

- `chrome-ctl start` (see the chrome-headless skill) before any run — the
  harness shells out to `agent-browser` over CDP.
- The app under test must already be served (e.g. `python3 -m http.server
  8100` from the app directory) — this harness does not start your app.
- The **agent-browser command reference** (and any direct browser driving
  beyond the harness's own verbs) lives in the **chrome-headless skill** —
  this skill points there and does not reproduce it.

## Layout

```
features/
  order.feature          # Feature + Scenario, plain Gherkin
  bug-999.feature        # a bug repro: setup + Actual:/Expected: tail
  steps/
    auth.steps           # Composite: definitions (project vocabulary)
    seed.steps           # step: leaves (code-block escapes)
```

Scenarios reference **your project's vocabulary** (`Composite:` groups) and
the **canonical core verbs** the harness ships with (below) — never both a
Gherkin body and an implementation in the same definition.

## Two definition kinds (`features/steps/*.steps`)

```
Composite: the user "{name}" is logged in
  When I open the page "index.html"
  And I fill the "Username" field with "{name}"
  And I fill the "Password" field with "secret"
  And I click "Sign In"
  Then I should be on the dashboard
```

- **`Composite:`** — a pure group of Gherkin step references, expanded at
  plan time into concrete steps. Body must contain **only** step lines
  (`Given`/`When`/`Then`/`And`/`But`/`*`) — no code fences, no `run:` ops.
  `{placeholders}` in the header are substituted into the body.
- **`step:`** — a leaf bound to an implementation channel (a concrete,
  already-core-vocabulary step, or a code-block escape — see below). A leaf
  must **not** contain a Gherkin body; if it does, it should be a
  `Composite:` instead.
- `validateDefinitions` enforces this split at load time; a `.steps` file
  that mixes them is rejected with a precise violation, not silently
  accepted.

Both headers are case-insensitive and always start at column 0; bodies are
indented under them. `#` starts a comment (skipped, except verbatim inside
a fenced code block).

## `Actual:`/`Expected:` — bug-repro branch tail

```gherkin
Scenario: order confirmation shows the wrong message
  Given the user "Macario" is logged in
  When I fill the "Item" field with "Wonder Widget"
  And I click "Submit Order"
  Actual:
    Then I should see the message "Honky dory!"
  Expected:
    Then I should see the message "All good!"
```

A `Scenario:` may end with exactly this tail: one `Actual:` header, one
`Expected:` header (in that order), each followed by exactly one step, and
nothing after. This is scenario syntax, not a `.steps` construct — malformed
usage (missing pair, extra steps, wrong order) is a parse-time error. This is
the mechanism behind bug reproduction — see `bug-reports.md`.

## Canonical core vocabulary

The harness ships a small, fixed set of core verbs — you don't redefine
these, you compose them. Each has a phase: `action` (drives the UI, no
judgement) or `observe` (a `Then` stop-point where you'll be asked to
judge).

| phase | pattern |
|---|---|
| action | `I open the page "{path}"` |
| action | `I reload the page` |
| action | `I click "{name}"` |
| action | `I fill the "{label}" field with "{value}"` |
| action | `I press "{key}"` |
| action | `I check "{label}"` |
| action | `I uncheck "{label}"` |
| action | `I select "{value}" in the "{label}" field` |
| observe | `I should see the message "{text}"` |
| observe | `I should see "{text}"` |
| observe | `I should be on the "{page}"` |

Use **visible text**, not DOM ids or CSS selectors — `I click "Sign In"`
matches what a human would read, and `find label "..."` matching is
visible-text based (an id like `#username` will not match a label
"Username").

A step that matches neither a core verb nor a project `Composite:`/`step:`
definition is **UNDEFINED** — the run stops with an error verdict rather
than guessing. Add a definition (or extend the core, harness-side) instead
of rephrasing prose to dodge the gap.

## Code-leaf escapes (`step:` with a fenced body)

```
step: the browser storage is empty
  ```js
  sessionStorage.clear();
  localStorage.clear();
  ({ cleared: true })
  ```
```

Two channels, least-power first:

1. Core verbs / project composites (UI-level, visible text) — always prefer these.
2. agent-browser natives (cookies/storage/set) when no UI path exists.
3. ` ```js ` — evaluated in-page via agent-browser eval; last expression is the result.
4. ` ```bash ` — evaluated locally from the project root; JSON on stdout is the result.

A code leaf always executes as the **action** phase — it seeds or mutates
state, it is never itself a judged `Then`; a non-zero exit aborts the run
with an error, exactly like any other action. ` ```js ` bodies run via
`agent-browser eval --base64 ...` (placeholders substituted first, then
base64-encoded — sidesteps shell-escaping entirely); ` ```bash ` bodies run
as-is, verbatim, from the project root.

## Authoring-time lint

- **`validate_steps {}`** — always available, independent of any run. Lints
  every `features/steps/*.steps` file: purity (the `Composite:`/`step:`
  split), duplicate pattern definitions, and `Composite:` body steps that
  resolve to neither a core verb nor another definition (a dangling
  reference — otherwise it only surfaces as UNDEFINED mid-run). Run this
  after adding or editing a `.steps` file, before `qa_run`.

## Running a feature

Five tools, **all always available** — no dynamic activation. Run state is
shared process-wide while tool visibility is per session, so a stop-point
must be judgeable from any session and a wedged run must always be
abortable (see recovery note under `qa_run`):

- **`list_steps {}`** — the vocabulary truth: every core verb and every
  `features/steps/*.steps` definition, with bodies. Query it before
  authoring (see `scenarios.md`) or before adding a definition, so you reuse
  patterns instead of duplicating them.
- **`qa_run { feature, baseUrl, onFail }` — parses the feature +
  `features/steps/*.steps`, validates purity, expands composites, and
  drives actions until the first `Then` stop-point. Returns a
  self-contained prompt: what was performed, the expected step, and the
  observed evidence (text + exit code). `onFail` (`stop` | `continue`,
  default `continue`) controls whether a `fail` verdict ends the scenario
  immediately or the harness keeps driving to record every divergence.
  Only one run is enforced at a time per pi process. If `qa_run` reports a
  run already in progress, either judge/abort it (see below) or wait — a
  run left idle at a stop-point for more than ~2.5 min is treated as
  abandoned and auto-discarded the next time a new `qa_run` starts, with a
  `NOTE:` line in the result.
- **`qa_judge { verdict, divergence? }`** — `success | fail | skip | error`.
  Judge only from the evidence you were handed — never from what you
  expect the app to do. On `fail`, include a one-line `divergence`
  (expected vs. observed). The harness records your verdict and drives to
  the next stop-point (or to `RUN COMPLETE`).
- **`qa_abort`** — discard the in-progress run, no report. Always available:
  it is the recovery path when `qa_run` reports a run already in progress
  (e.g. one started by a session that ended before judging its last
  stop-point). Discarding is safe — just start the run again.

A bug-repro scenario's `Expected:` stop-point is checked **first**; a
success there short-circuits the run past `Actual:` entirely (bug considered
fixed). Only when `Expected:` fails does the harness drive to `Actual:`, to
confirm the bug as reported. Judge each exactly as honestly as any other
step — a `fail` on `Expected:` is the normal, expected routing path, not a
run failure. The harness (not you) turns your honest verdicts into
`fixed` / `reproduced` / `not-reproduced`.

## The final report

`RUN COMPLETE` gives you the **actionable** report: a one-line header with
counts per outcome, then a block **only** for scenarios that need action —
failures, and any bug-repro scenario (`reproduced`, `fixed`, or `not-reproduced`).
Passing plain scenarios are counted, not detailed; you don't need their
trace to act.

```
RUN COMPLETE

# 3 scenarios · 2 success · 1 reproduced
scenario order confirmation shows the wrong message  ->  reproduced
  [fail] step 8: I should see the message "All good!"
      evidence: ✗ Wait timed out after 25000ms
      divergence: expected "All good!"; observed "Honky dory! Ordered: Wonder Widget."
```

A full human-facing record (every step, every scenario) is persisted as a
`qa-run` transcript entry — that's for the person reading the session, not
for you to re-derive or repeat back.

## Between scenarios

When a feature has more than one `Scenario:`, the harness resets state
between them — reopens the base URL and clears `sessionStorage`/`localStorage`
— before driving the next one (not before the first; its own `Given` steps
establish the starting state). Write each scenario's setup as if the browser
starts fresh, because it will: don't rely on a previous scenario having left
you logged in or mid-flow.

## Writing a new scenario (story authoring)

See `scenarios.md` in this directory for the full story-authoring workflow:
ground in `list_steps` first, one behavior per `Scenario:`, setup as a
`Composite:`, one observable `Then`, extend the vocabulary when a step would
be UNDEFINED, then `validate_steps` + `qa_run`. In one line: **query the
vocabulary, reuse it, and let the harness own execution and derivation.**

## Bug reproduction

See `bug-reports.md` in this directory for turning an existing bug report,
or a bug you find while testing, into one atomic runnable scenario with an
`Actual:`/`Expected:` branch tail.
