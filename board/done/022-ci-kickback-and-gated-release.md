# 022 — CI kickback on main + gate release behind checks

Allow direct pushes to `main`/`master`. When required CI workflows fail on those pushes, automatically revert ("kickback") the failing commit. Release/deploy must not package or publish until those same checks have succeeded for the commit, and must not run for kickback or Actions bot version-bump commits.

## Acceptance criteria

- [x] Pure policy helpers decide when to kickback vs skip (push + failure + protected branch; skip kickback commits)
- [x] Pure policy helpers decide when required check runs are still pending, all success, or any failure
- [x] Unit tests cover kickback and check-gate policy
- [x] GitHub Actions workflow reverts failing `main`/`master` push commits when Lint / Type Check / Unit Tests / Dead Code / Security Audit fail
- [x] Release workflow waits for those required checks before build/publish, and skips kickback / `github-actions[bot]` pushes
- [x] `npm run lint`, `npm run format:check`, `npm test`, `npm run type-check` pass
