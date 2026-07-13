# EPIC: Documentation sync

Project docs are significantly out of date relative to the codebase. `ARCHITECTURE.md` describes Electron 27, 15 server app IDs, and a minimal App — the app now has config editor, backups, auto-update, frameless window, and only 2 servers.

**Code review findings:**
- `ARCHITECTURE.md`: wrong Electron version (27 vs 39), wrong server count, missing IPC channels
- `README.md`: informal tone; doesn't mention config editor, backups, or frameless UI
- `IMPLEMENTATION_SUMMARY.md`, `GETTING_STARTED.md`, `DOCUMENTATION_INDEX.md` may duplicate or contradict each other
- `package.json` description is generic ("Electron Server Manager Application")

## Sub-tickets

| Id | Title |
|----|-------|
| 008.1 | Refresh ARCHITECTURE.md |
| 008.2 | Rewrite README for current feature set |
| 008.3 | Consolidate or archive stale doc files |

### 008.1 — Refresh ARCHITECTURE.md

Update architecture doc: Electron 39, Vite 7, actual IPC channel list, ConfigEditor, TitleBar, backup/auto-update flows, 2-server catalog.

**Origin:** Code review — doc drift.

#### Acceptance criteria

- [x] Technology stack section matches `package.json` versions
- [x] File organization includes ConfigEditor, TitleBar, driveUtils
- [x] IPC section lists all registered handlers
- [x] Performance/security sections reviewed for accuracy

### 008.2 — Rewrite README for current feature set

Professional README covering: detection, run/stop, auto-restart, auto-update, backups, config editor, multi-library support (planned), dev setup, and board workflow.

**Origin:** Code review — README is informal and incomplete.

#### Acceptance criteria

- [x] README describes all user-facing features accurately
- [x] Dev commands match `package.json` scripts
- [x] Links to ARCHITECTURE.md and board workflow
- [x] Tone is clear and professional (can keep light personality)

### 008.3 — Consolidate or archive stale doc files

Review `IMPLEMENTATION_SUMMARY.md`, `GETTING_STARTED.md`, `QUICKSTART.md`, `CODE_REFERENCE.md`, `DOCUMENTATION_INDEX.md` for overlap. Merge into README/ARCHITECTURE or move to `docs/archive/`.

**Origin:** Code review — doc sprawl.

#### Acceptance criteria

- [x] Each remaining doc file has a clear single purpose
- [x] `DOCUMENTATION_INDEX.md` lists only maintained docs
- [x] Removed/merged files don't leave broken links in repo
- [x] `grep` for dead links in markdown passes manual review

## Acceptance criteria (epic)

- [x] ARCHITECTURE reflects actual IPC channels, file layout, and tech versions
- [x] README accurately describes features and setup
- [x] Doc index points only to maintained files
- [x] No contradictory version numbers across docs
