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
    Actual:
      Then I should see the message "Please enter a keyword… Please enter a keyword…"
    Expected:
      Then I should see exactly one such message
```

Rules:

- **One scenario** — atomic: setup and both branches live in the same
  scenario, never split across scenarios.
- **`Actual:`/`Expected:` is a scenario tail**, not a `.steps` construct —
  write the branch steps inline, in the scenario itself.
- Exactly one `Actual:` header and one `Expected:` header, **`Actual:`
  before `Expected:`**, each followed by **exactly one** step, and nothing
  after the pair. Anything else (missing header, two steps under one header,
  extra lines after `Expected:`, reversed order) is a parse-time error, not
  a silently dropped branch.
- Capitalization is exact: `Actual:` and `Expected:`, not `actual:` or
  `ACTUAL:`.
- You never write the status. The harness derives it — and checks
  `Expected:` **first**, only falling through to `Actual:` when `Expected:`
  fails.

## Derivation (know what will be reported)

```
fixed          ⇔  Expected: holds                       (Actual: never checked — short-circuited)
reproduced     ⇔  Expected: fails  ∧  Actual: holds      (bug present, as reported)
not-reproduced ⇔  Expected: fails  ∧  Actual: also fails  (neither observed — report stale)
```

This is harness-side ledger arithmetic (`bugStatus` in `src/ledger.ts`) —
never your job to fudge a judgement to make the status come out right. A
`fail` verdict on `Expected:` is the *normal* branch-routing outcome while a
bug is present, not a run failure — don't hesitate to report it honestly.

## Mode A — reproduce an existing report

1. **Read** the report. Extract: setup (preconditions), trigger steps, claimed
   actual, claimed expected.
2. **Reproduce first.** Drive the browser through setup + trigger. Observe the
   actual behavior and **capture the exact symptom — quote it**.
3. Write the `Actual:` step **from what you observed**, not from the
   report's prose. If your observation disagrees with the report, your
   observation wins — note the discrepancy.
4. Write the `Expected:` step as the intended behavior: a single-focused,
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

- `Actual:` = observed reality (must hold). Write from evidence; quote the
  symptom.
- `Expected:` = intended reality (checked first; expected to fail while the
  bug is present). Keep it a single observable `Then`.
- Reuse existing vocabulary and composites for the setup steps; query
  `list_steps {}` first — it is the vocabulary truth. `Actual:`/`Expected:`
  steps themselves must each resolve (after any composite expansion) to
  exactly one concrete step — `qa_run` rejects the feature otherwise.
- Judge each `Then` honestly: success = observed, fail = diverged. The
  harness owns the branch routing and the derived status, not you.
