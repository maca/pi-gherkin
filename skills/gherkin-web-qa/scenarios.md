# Authoring scenarios / stories → runnable Gherkin

> Fragment of `SKILL.md` (story- and scenario-authoring workflow). Assumes the
> core step vocabulary, the stop-point model, and the tool set defined in the
> main skill. For turning a *bug* into a reproduction, see `bug-reports.md`.

Purpose: turn a story, feature request, or acceptance criterion into
**runnable Gherkin** the harness can drive. The `.feature` file is the story;
the harness is the only source of truth for what steps mean.

## The artifact

```gherkin
# features/checkout.feature
Feature: Checkout with an item in the cart

  Scenario: a logged-in user buys the only item
    Given the user "Macario" is logged in
    When I fill the "Item" field with "Wonder Widget"
    And I click "Submit Order"
    Then I should see the message "Honky dory!"
```

Rules:

- **One behavior per `Scenario:`** — arrange (setup), act (the thing under
  test), assert (one observable `Then`).
- **Setup is a `Composite:`** (`the user "{name}" is logged in`), not inline
  prose you retype in every scenario.
- **Act inline** with core verbs; **assert** with a single focused `Then` at
  UI altitude (visible text, not DOM ids/selectors).
- You never invent a step from nowhere: every step is a core verb or a project
  definition, verified by `list_steps`.

## Workflow

1. **Ground in vocabulary first.** Call `list_steps {}` — it lists the core
   verbs and every `features/steps/*.steps` definition. Reuse what exists;
   don't reauthor a login composite that's already there. This is the
   duplication-prevention step: the tool, not a doc file, is the truth.
2. **Map the story to scenarios.** Each acceptance criterion → one scenario.
   If a criterion is compound ("adds, removes, and reorders"), split it into
   one scenario each.
3. **Write setup as a composite, action inline, one `Then`.** Prefer core
   verbs directly; reach for a new `Composite:` only for setup/teardown you'll
   reuse, and a new `step:` leaf only when you're genuinely leaving the UI.
4. **If a step would be UNDEFINED, extend the vocabulary** — don't rephrase the
   prose to dodge it. Add the `Composite:`/`step:` to `features/steps/*.steps`,
   then run `validate_steps {}` (purity, duplicates, dangling refs) before
   running.
5. **Run** (`qa_run`), judge each stop-point honestly from the evidence. The
   harness derives the status — your job ends at the verdict.

## The least-power ladder

When a scenario needs something the vocabulary doesn't have, climb one rung at
a time and stop at the first that suffices:

1. **Core verb** (already shipped — check `list_steps`).
2. **`Composite:`** of core verbs (reusable, pure Gherkin).
3. **agent-browser native** (cookies/storage) — see the **chrome-headless
   skill** for the agent-browser command reference; don't inline commands you
   haven't seen documented there.
4. **`step:` leaf** with a fenced ` ```js ` / ` ```bash ` body (in-page /
   local; last-expression-or-JSON-stdout is the result).

> **Browser driving is covered by the chrome-headless skill.** This skill only
> points there — it does not reproduce the agent-browser command reference.

## Discipline

- Reuse vocabulary (query `list_steps`), reuse composites, keep steps at UI
  altitude, visible text only.
- One behavior, one `Then`. If you find yourself writing two `Then`s about
  different things, that's two scenarios.
- Judge from evidence, never from what you expect the app to do; never
  simulate a command result.
- Let the harness own execution and derivation. Your authored artifact is the
  scenario, not the verdict.
