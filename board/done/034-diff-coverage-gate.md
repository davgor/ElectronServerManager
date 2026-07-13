# 034 — Diff coverage CI gate (blocking)

Companion to `board/in-progress/033-pr-coverage-comment.md`. 033 is deliberately comment-only / non-blocking; this ticket adds the blocking counterpart the user asked for separately: fail CI when newly added/changed lines in a diff aren't covered by tests, without requiring a backfill of pre-existing gaps.

**Why not fold into 033:** 033's own description says "comment-only (no fail gate for coverage deltas)" — that's a real, intentional design choice (informational visibility vs. enforcement), not an oversight. Adding a gate there would contradict the ticket. Keeping them separate also means either can be reverted/tuned independently.

**Design:** reuses the pure parsing/aggregation helpers from `.github/scripts/coverage-report-policy.cjs` (`parseLcov`, `parseUnifiedDiffAddedLines`, `computeNewLineCoverage`) rather than re-implementing diff/lcov parsing, so the blocking gate and the informational PR comment always agree on what "new-line coverage" means.

## Acceptance criteria

- [x] `.github/scripts/diff-coverage-gate.cjs` computes coverage on added/changed lines only (via `coverage-report-policy.cjs`) and exits non-zero below `DIFF_COVERAGE_THRESHOLD` (default 80%)
- [x] `unit-tests.yml` runs tests with `--coverage`, determines a base SHA (PR base or previous push commit), and runs the gate as a required step on the existing "Run unit tests (20.x)" check — no new workflow/check name, so `kickback-policy.cjs`'s `REQUIRED_CI_CHECK_NAMES` needed no changes
- [x] `npm run test:diff-coverage` lets a local run (or an agent, before finishing a task) check the same gate against the working tree, auto-detecting a base via `origin/main`/`origin/master`
- [x] `.claude/skills/delivery-standards/SKILL.md` verification gate and quick checklist updated to require `npm run test:diff-coverage` before reporting work done
- [x] Verified against real history: correctly passes on a clean diff, correctly flags a historical 0%-covered file (`initCatalog.ts`) when diffed against an older base, correctly exits non-zero when the threshold is set above actual diff coverage
- [x] `npm run lint`, `npm test`, `npm run type-check` pass

## Known pre-existing gap (not introduced by this ticket)

`npm run deadcode` currently flags several exports in `src/ci/coverageReport.ts` (033's file) as "used in module" — e.g. `normalizeSourcePath`, `CoverageMetric`, `MetricKey`, `MetricDeltas`, `FileNewLineCoverage`, `NewLineCoverage`, `LcovHitMap`, `BuildCoverageMarkdownInput`. These aren't imported outside the module (the test file only imports a subset), so `ts-prune` treats them as dead exports. `deadcode.yml` CI would fail on this today since `.tsprune-ignore` is empty. Left for whoever owns 033 to resolve (either narrow the exports or add intentional entries to `.tsprune-ignore`) — out of scope here since it's not this ticket's file.
