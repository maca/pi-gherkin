# Bug reproduction → runnable Gherkin

> Fragment of `SKILL.md` (bug-report authoring workflow). Assumes the core
> step vocabulary and the stop-point model defined elsewhere in the skill.

Purpose: turn a bug into a **runnable Gherkin reproduction**. Two entry modes,
one artifact.

## The artifact — one atomic scenario

```gherkin
# features/bug-1234.feature
Feature: Bug 1234 — duplicate error message

  Scenario: empty search shows a duplicated error
    Given the user is logged in
    When I leave the "search" field empty
    And I click "Search"
    Then the actual behavior is observed
    Then the expected behavior is observed
```

```gherkin
# features/steps/bug1234.steps
Composite: the actual behavior is observed
  Then I should see the message "Please enter a keyword…"

Composite: the expected behavior is observed   [inverted]
  Then I should see exactly one such message
```

Rules:

- **One scenario** — atomic: setup and both branches live in the same scenario,
  never split across scenarios.
- **Branches are composites** in `features/steps/*.steps`, not inline prose.
- **`[inverted]`** on a composite header marks "checked-but-inverted": its
  `Then`s are expected to **fail** while the bug is present. Unmarked
  composites must hold. The flag propagates through expansion to the concrete
  steps.
- You never write the status. The harness derives it.

## Derivation (know what will be reported)

```
reproduced            ⇔  actual branch holds  ∧  inverted branch fails
not reproduced / fixed ⇔  inverted branch holds
couldn't reproduce    ⇔  actual branch not observed
```

The inversion is harness-side ledger arithmetic — never your job to fudge a
judgement to make the status come out right.

## Mode A — reproduce an existing report

1. **Read** the report. Extract: setup (preconditions), trigger steps, claimed
   actual, claimed expected.
2. **Reproduce first.** Drive the browser through setup + trigger. Observe the
   actual behavior and **capture the exact symptom — quote it**.
3. Write the `actual` composite **from what you observed**, not from the
   report's prose. If your observation disagrees with the report, your
   observation wins — note the discrepancy.
4. Write the `expected` composite as the intended behavior: a single-focused,
   observable `Then`, UI altitude.
5. **Run.** Confirm `reproduced`. Attach the run's evidence + divergence back
   to the report.

## Mode B — proactively identify a bug

1. While testing, when behavior differs from intent: capture the exact observed
   symptom (quote it) and the intended behavior.
2. Write the same artifact. **The runnable Gherkin is the report** — the run's
   evidence and divergence are the report body. No separate prose document.
3. Run to confirm `reproduced`.

## Discipline

- `actual` = observed reality (must hold). Write from evidence; quote the symptom.
- `expected` = intended reality (must fail while the bug is present). Keep it a
  single observable `Then`.
- Reuse existing vocabulary and composites; add a `step:`/`Composite:` only when
  genuinely new (check `ghk index` first).
- Judge each `Then` honestly: success = observed, fail = diverged. The harness
  owns the inversion, not you.
