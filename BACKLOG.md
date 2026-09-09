# Scratchpad — unimplemented ideas

The harness is the source of truth (tools + `features/steps/*.steps`), not
docs. This file is the parking lot for ideas we haven't built yet. Move an
item out when we decide to build it; delete it when it's done.

## Engine / tools

- **Suite runner** — drive every `features/*.feature` in one `qa_run` pass
  (corpus regression + drift detection), instead of one feature per call.
- **Screenshot / visual evidence at fail** — capture an `agent-browser`
  screenshot on `fail`/`divergence` and surface it in the human `qa-run`
  entry (evidence is currently text-only).
- **Unknown code-leaf fence language** — ` ```foo ` bodies are currently
  skipped silently by `resolveLeaf`; surface a clear "no execution channel"
  error instead.
- **App / base-url config** — a per-project notion of which app + port to
  test (replaces the ad-hoc `baseUrl` default).
- **`list_steps` filtering** — per-feature or per-kind views once the corpus
  grows (nice-to-have; the full dump is fine at this size).

## Skills

- **Wire the kit into `~/nix` (submodule + symlinks)** — the extension is now
  symlink-safe and committed at `extension/gherkin-qa.ts`, and `SKILL.md` has
  frontmatter. Remaining: `git submodule add` into `~/nix`, then symlink
  `skills/gherkin-web-qa -> <submodule>/skills/gherkin-web-qa` and
  `pi/agent/extensions/gherkin-qa.ts -> <submodule>/extension/gherkin-qa.ts`
  (the existing convention: `skills -> ../../skills`, `claude-direct.ts`).
- **Vocabulary-teaching ritual as a skill** — a fragment formalizing
  "gap → author def → `validate_steps` → re-run" and the naming/`{placeholder}`
  conventions. Currently implied across SKILL.md + `scenarios.md` but not one
  place.
- **Cross-project step-library** — a shared vocabulary home (e.g. login,
  form-fill) reusable across repos vs. today's per-project `features/steps/`.

## UI / polish (needs the human's TUI eyes)

- **`qa-run` entry renderer** — verify colors/layout/truncation in a real
  session; the current renderer was written blind.
- **Widget** — consider a reset/scenario-transition marker line.

## Doc hygiene

- Any remaining references to removed tooling (the old `ghk index`) — fixed
  in `bug-reports.md`; re-scan the skill files for others before each commit.
