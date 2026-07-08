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

## Acceptance criteria (epic)

- [ ] ARCHITECTURE reflects actual IPC channels, file layout, and tech versions
- [ ] README accurately describes features and setup
- [ ] Doc index points only to maintained files
- [ ] No contradictory version numbers across docs
