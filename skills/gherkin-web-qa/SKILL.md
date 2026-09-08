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

## Layout

```
features/
  order.feature          # Feature + Scenario, plain Gherkin
  bug-999.feature        # a bug repro, same shape
  steps/
    auth.steps           # Composite: definitions (project vocabulary)
    seed.steps           # step: leaves (code-block escapes)
    bug999.steps         # Composite: definitions for one bug repro
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

## `[inverted]` — checked-but-inverted branches

```
Composite: the expected behavior is observed   [inverted]
  Then I should see exactly one such message
```

Mark a `Composite:` header `[inverted]` when its steps are **expected to
fail** while a bug is present (rather than expected to hold, the default).
The flag propagates recursively through nested composite expansion. This is
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

Four tools; `validate_steps` and `qa_run` are always available, the other
two activate only while a run is in progress (guardrails, like pi-magit's
rebase tools):

- **`qa_run { feature, baseUrl, onFail }` — parses the feature +
  `features/steps/*.steps`, validates purity, expands composites, and
  drives actions until the first `Then` stop-point. Returns a
  self-contained prompt: what was performed, the expected step, and the
  observed evidence (text + exit code). `onFail` (`stop` | `continue`,
  default `continue`) controls whether a `fail` verdict ends the scenario
  immediately or the harness keeps driving to record every divergence.
- **`qa_judge { verdict, divergence? }`** — `success | fail | skip | error`.
  Judge only from the evidence you were handed — never from what you
  expect the app to do. On `fail`, include a one-line `divergence`
  (expected vs. observed). The harness records your verdict and drives to
  the next stop-point (or to `RUN COMPLETE`).
- **`qa_abort`** — discard the in-progress run, no report.

An inverted stop-point (`mode: inverted`) is called out explicitly in the
prompt: *"this branch is EXPECTED to fail while the bug is present."* Judge
it exactly as honestly as any other step — from the evidence, not from what
would make the derived status come out a particular way. The harness (not
you) turns your honest verdicts into `reproduced` / `fixed` / `drift`.

## The final report

`RUN COMPLETE` gives you the **actionable** report: a one-line header with
counts per outcome, then a block **only** for scenarios that need action —
failures, and any bug-repro scenario (`reproduced`, `fixed`, or `drift`).
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

## Writing a new scenario

1. Check what already exists — `features/steps/*.steps` — before adding a
   new `Composite:`/`step:`. Reuse vocabulary.
2. Keep each `Scenario:` about one behavior. Setup via a `Composite:`
   (`the user "{name}" is logged in`), the action under test inline, one
   focused `Then`.
3. Prefer the core verbs directly in the feature body; reach for a new
   `Composite:` only for setup/teardown you'll reuse, and a new `step:`
   leaf only when you're genuinely leaving the UI (and then via the
   least-power ladder above).
4. Run it. Judge honestly at each stop. Let the harness's derivation (not
   your narration) decide the final status.

## Bug reproduction

See `bug-reports.md` in this directory for turning an existing bug report,
or a bug you find while testing, into one atomic runnable scenario with an
`actual` and an `[inverted]` `expected` composite branch.
