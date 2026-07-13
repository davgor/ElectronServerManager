# 033 — PR coverage report comments

Post a sticky PR comment comparing Jest coverage on the base vs head SHAs, including coverage on newly added lines. Comment-only (no fail gate for coverage deltas).

## Acceptance criteria

- [ ] GitHub Actions workflow runs on pull requests to `main`/`master` and posts or updates a sticky coverage comment
- [ ] Comment shows before (base) vs after (head) totals with deltas for statements, branches, functions, and lines
- [ ] Comment shows coverage on newly added lines (from git diff + head lcov), including a short per-file breakdown when uncovered new lines exist
- [ ] Pure report builders in `src/ci/coverageReport.ts` are unit-tested
- [ ] `npm run lint`, `npm run format:check`, `npm test`, `npm run type-check`, `npm run deadcode` pass
