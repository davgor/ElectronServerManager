# EPIC: BoosterSeat CI/CD gaps + AI-TTRPG app-update fluidity

Import the delivery/CI process pieces still missing from [davgor/BoosterSeat](https://github.com/davgor/BoosterSeat), then bring packaged **app** auto-update UX to the same fluidity as [davgor/AI-DND-Matrix](https://github.com/davgor/AI-DND-Matrix) (AI-TTRPG). Implement **037.1 before 037.2** (user order: items 0 → 1).

**Not in scope:** SteamCMD / game-file updates (epic **038**). GitHub Pages deploy from BoosterSeat (web-only). Replacing ESM’s existing split CI workflows wholesale unless a clear win.

## Research notes

### Item 0 — BoosterSeat CI/CD still missing here

ESM already has lint, typecheck, unit tests + diff-coverage, deadcode, security audit, kickback, coverage-report, and gated release (epics 017/022/028/033/034). BoosterSeat still has process that we lack:

| BoosterSeat piece | Status in ESM | Import? |
|-------------------|---------------|---------|
| `fireguard/` + `.fireguardrc.json` + PR comment job | Missing | **Yes** — grades new/changed unit tests |
| `red-team-review` + `antagonistic-pr-review` skills + Cursor rule | Missing (only delivery/complete/collapse) | **Yes** |
| `.github/PULL_REQUEST_TEMPLATE.md` (verification + red-team checklist) | Missing | **Yes** |
| Husky + lint-staged pre-commit | Missing | **Yes** (lightweight) |
| `scripts/deadcode-check.mjs` + `deadcode-refresh.mjs` baseline | ESM uses raw `ts-prune` | **Yes** — baseline avoids noisy fails |
| `scripts/bump-minor-version.mjs` (+ tests) | Inline `sed` patch bump in `release.yml` | **Optional** — prefer shared script for correctness |
| Consolidated `pr-checks.yml` | Split workflows (fine) | Keep split unless consolidating simplifies gates |
| Playwright e2e | Missing | **Defer** — BoosterSeat’s own Electron stack doc says drop or keep only headless renderer flows |
| Pages `deploy.yml` | N/A (Electron release exists) | **No** |
| Node 22 in CI | Node 20 | Optional follow-up; not required to import process |

### Item 1 — AI-TTRPG update fluidity gaps

ESM already has electron-updater → GitHub Releases, 4h polling, silent `quitAndInstall(true, true)`, phase banner (checking / available / downloading / ready / error) — epics **012** / **031**. AI-TTRPG (epics 062 / 104 / 114) is ahead on **operator UX**:

| Behavior | AI-TTRPG | ESM today |
|----------|----------|-----------|
| Delayed first check (~8s) | Yes | Immediate on register (can race UI) |
| Settings **Check for updates** + visible result | Yes (`ManualUpdateCheckResult`) | IPC `app-update-check` exists; **no UI / no outcome messaging** |
| Ready CTA copy | “Restart and update” | “Restart & Install” |
| `DISABLE_AUTO_UPDATE=1` | Yes | No |
| Busy/disabled outcomes for manual check | Structured | `{ success: true }` no-op when busy |

Reference: `AI-DND-Matrix` `src/main/autoUpdate.ts`, `CheckForUpdatesButton.tsx`, `manualCheckMessage.ts`.

## Acceptance criteria (epic)

- [x] BoosterSeat process gaps listed above that are marked **Yes** are present and wired (fireguard job, red-team skill/rule, PR template, husky/lint-staged, deadcode baseline scripts)
- [x] Packaged app update UX matches AI-TTRPG fluidity: delayed initial check, Settings manual check with feedback, “Restart and update” copy, `DISABLE_AUTO_UPDATE` support
- [x] Unit/component tests cover new CI helpers and updater UX; verification gate passes (`lint`, `format:check`, `test`, `type-check`, `deadcode`, `test:diff-coverage`, `electron-build` / `build` as applicable)
- [x] `docs/AUTO_UPDATE.md` + `ARCHITECTURE.md` note the new check UX; delivery docs mention red-team / fireguard where relevant

## Sub-tickets

| Id | Title | Maps to |
|----|-------|---------|
| 037.1 | Import missing BoosterSeat CI/delivery process | Item 0 |
| 037.2 | AI-TTRPG-parity app update fluidity | Item 1 |

### 037.1 — Import missing BoosterSeat CI/delivery process

Port the quality-process layer from [davgor/BoosterSeat](https://github.com/davgor/BoosterSeat)
without replacing Electron release mechanics. See epic 037 research notes.

**Include:**

1. **Fireguard** — vendoring or adapting `fireguard/` + `.fireguardrc.json`; npm script; GitHub Actions job on PRs that grades new/changed unit tests and can comment on the PR.
2. **Red-team gate** — copy `red-team-review` (+ antagonistic alias) skills and alwaysApply Cursor rule; reference from delivery-standards / complete-ticket / `.ai-instructions.md`.
3. **PR template** — verification checklist + red-team checkbox (adapt Electron scripts: `npm test`, `electron-build`, etc.).
4. **Husky + lint-staged** — pre-commit runs prettier + eslint on staged `src` files.
5. **Deadcode baseline scripts** — replace or wrap raw `ts-prune` with BoosterSeat-style check/refresh so intentional exports can be baselined.

**Exclude / defer:** Playwright e2e, Pages deploy, forcing a single `pr-checks.yml`, Node 22 bump (separate if desired).

#### Acceptance criteria

- [x] Fireguard runs locally via npm script and in CI on PRs; unit tests for any adapted helpers pass
- [x] Red-team skill + Cursor rule exist under `.cursor/` and `.claude/`; delivery docs require it before merge-ready
- [x] `.github/PULL_REQUEST_TEMPLATE.md` lists verification + red-team
- [x] `prepare` / husky pre-commit formats and lint-fixes staged TS/TSX
- [x] `npm run deadcode` uses baseline-aware check; `deadcode:refresh` documented
- [x] Existing required CI (lint / typecheck / unit tests / deadcode / security) still green; kickback/release gates still reference the same required check names (update if job names change)

### 037.2 — AI-TTRPG-parity app update fluidity

Close the packaged-app update UX gap with [davgor/AI-DND-Matrix](https://github.com/davgor/AI-DND-Matrix)
while keeping ESM’s existing feed, polling interval, and silent install. See
epic 037 research notes. Reference: AI-DND-Matrix `src/main/autoUpdate.ts`,
`CheckForUpdatesButton.tsx`, `manualCheckMessage.ts`.

**Include:**

1. Delay first packaged check (~8s, injectable) then keep 4h poll.
2. Honor `DISABLE_AUTO_UPDATE=1` (and unpackaged) as “auto-update disabled.”
3. Settings (or title-bar adjacent) **Check for updates** control with immediate “Checking…” status and clear up-to-date / available / busy / disabled / error messages (mirror `ManualUpdateCheckResult` + `manualCheckMessage`).
4. Ready banner CTA copy → **Restart and update** (message + button).
5. Manual check IPC returns structured outcomes (not a silent success when busy).

#### Acceptance criteria

- [x] Packaged builds delay the first check; poll interval unchanged; overlapping checks still coalesced
- [x] `DISABLE_AUTO_UPDATE=1` skips real checks; unpackaged/dev still skips
- [x] UI control triggers check and shows checking / up-to-date / update-found / busy / error feedback
- [x] Ready state uses “Restart and update”; silent `quitAndInstall(true, true)` unchanged
- [x] Unit + component tests cover scheduling, disable flag, manual-check messaging, and CTA copy
- [x] `docs/AUTO_UPDATE.md` updated; verification gate passes
