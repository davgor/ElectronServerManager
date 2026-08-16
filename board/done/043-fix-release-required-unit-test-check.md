# 043 — Fix Release gate: unit test check name after Node 22

Release has timed out (~45m) on every recent `main` push because
`REQUIRED_CI_CHECK_NAMES` still waits for `Run unit tests (20.x)`. Epic 041
moved unit tests to Node 22, so GitHub now reports `Run unit tests (22.x)` —
the required name never appears and packaging never starts. Latest published
release remains `v1.0.33` (2026-07-21).

Also drop the single-entry Node matrix on Unit Tests so the check-run name is
stable (`Run unit tests`) and future Node bumps do not break the Release gate
again.

## Acceptance criteria

- [x] `unit-tests.yml` uses Node 22 without a matrix; GitHub check-run name is `Run unit tests`
- [x] `REQUIRED_CI_CHECK_NAMES` includes `Run unit tests` (not `20.x` / `22.x`) in both `src/ci/kickbackPolicy.ts` and `.github/scripts/kickback-policy.cjs`
- [x] Unit tests assert that required name and evaluate success/pending/failure against it
- [x] `npm test` (kickback policy suite) and remaining delivery gates pass
