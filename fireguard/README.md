# fireguard

Deterministic unit-test quality grader for agent-authored Jest tests. Vendored
and adapted from [davgor/BoosterSeat](https://github.com/davgor/BoosterSeat)
(`fireguard/`), retargeted from Vitest to this repo's Jest + `src/__tests__/`
layout.

Fireguard assigns a letter grade (**A–F**) using three fail-fast gates — no LLM
evaluation:

1. **AST** — mock/assert ratio, tautological assertions, empty tests (counts
   `jest.*` and `vi.*` mock APIs)
2. **Flake** — added/modified tests (git diff vs `main`) must pass the
   configured number of isolated runs at **0%** flake (fail-fast; reports
   `executed/configuredRuns`)
3. **Mutation** — changed production modules must kill ≥ **75%** of mutants,
   using only the graded (added/modified) test files

## CLI

```bash
npm run fireguard
npm run fireguard -- --json
npm run fireguard -- --comment-pr
npm run fireguard -- --help
```

| Exit | Meaning                       |
| ---- | ----------------------------- |
| 0    | Pass (grade A–D)              |
| 1    | Quality failure (grade **F**) |
| 2    | Tool error                    |

### PR grade comments

On GitHub Actions pull requests (`.github/workflows/fireguard.yml`),
`--comment-pr` upserts a sticky comment marked `<!-- fireguard-report -->` with
the letter grade (requires `pull-requests: write` and `GITHUB_TOKEN`). Also
appends to `GITHUB_STEP_SUMMARY` when set.

## Config (`.fireguardrc.json` at the repo root)

This repo overrides two defaults, with rationale:

- `maxTautologicalRatio: 0.5` (default 0.1) — Electron main-process tests
  assert IPC/spawn interactions on injected deps (`toHaveBeenCalledWith`),
  which is the observable behavior under test, not a tautology.
- `agenticFlakinessRuns: 10` (default 100) — each isolated run boots Jest +
  ts-jest, so 100 runs would dominate CI time; 10 fail-fast runs still catch
  order/time-dependent flake.

Env overrides: `FIREGUARD_MIN_MUTATION_SCORE`, `FIREGUARD_MAX_MOCK_RATIO`,
`FIREGUARD_AGENTIC_FLAKINESS_RUNS`, `FIREGUARD_BASE_REF`,
`FIREGUARD_TEST_COMMAND`.

## Scope rules

- **Graded tests** — paths with git status `A`/`M`/`R`/`C` matching `include`
  vs `baseRef`
- **Changed modules** — added/modified production `src|lib|app` files (not
  tests; `src/__tests__/` helpers and `fireguard/` itself are excluded)
- Production modules changed with **no** graded test updates → grade **F**
  (fail closed)
- No graded tests and no module changes → skip with grade A
- Mutation writes in-place with `try/finally` restore plus a process `exit`
  hook to avoid dirty trees

## Grades

Hard gate failure → **F** (score 0). Meeting thresholds starts at **C** (~70);
lower mock density and higher mutation kill rates raise the score toward
**A**.

Fireguard's own unit tests live in `fireguard/__tests__/` and run with the
normal `npm test` suite. Type-checking runs via
`tsc --noEmit -p fireguard/tsconfig.json` (part of `npm run type-check`).
