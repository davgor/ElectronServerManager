# EPIC: Cross-platform server support

The app claims cross-platform support in docs but server definitions and paths are Windows-only. `ARCHITECTURE.md` references 15 known server app IDs; only 2 exist in `STEAM_DEDICATED_SERVERS`.

**Code review findings:**
- Executables hardcoded as `.exe` (`enshrouded_server.exe`, `PalServer.exe`)
- Palworld config path hardcoded to `WindowsServer` subfolder
- `isDev` detection duplicates logic; `electron-is-dev` is unused in source
- Linux/macOS dedicated servers use different binary names and config paths

## Sub-tickets

| Id | Title |
|----|-------|
| 005.1 | Platform-aware executable resolution |
| 005.2 | Platform-aware config/save path resolution |
| 005.3 | Document server catalog extension process |
| 005.4 | Align ARCHITECTURE server count with reality |

## Acceptance criteria (epic)

- [ ] Server start/stop/detection works on Windows, Linux, and macOS for supported games
- [ ] `STEAM_DEDICATED_SERVERS` schema supports per-platform overrides
- [ ] Docs describe how to add a new dedicated server entry
- [ ] Tests cover at least one non-Windows executable path
