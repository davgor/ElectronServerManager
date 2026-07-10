# EPIC: Cross-platform server support

The app claims cross-platform support in docs but server definitions and paths are Windows-only. `ARCHITECTURE.md` references 15 known server app IDs; only 2 exist in `STEAM_DEDICATED_SERVERS`.

**Code review findings:**
- Executables hardcoded as `.exe` (`enshrouded_server.exe`, `PalServer.exe`)
- Palworld config path hardcoded to `WindowsServer` subfolder
- `isDev` detection duplicates logic; `electron-is-dev` is unused in source
- Linux/macOS dedicated servers use different binary names and config paths

## Acceptance criteria (epic)

- [x] Server start/stop/detection works on Windows, Linux, and macOS for supported games
- [x] `STEAM_DEDICATED_SERVERS` schema supports per-platform overrides
- [x] Docs describe how to add a new dedicated server entry
- [x] Tests cover at least one non-Windows executable path

## Sub-tickets

| Id | Title |
|----|-------|
| 005.1 | Platform-aware executable resolution |
| 005.2 | Platform-aware config/save path resolution |
| 005.3 | Document server catalog extension process |
| 005.4 | Align ARCHITECTURE server count with reality |

### 005.1 — Platform-aware executable resolution

Extend `ServerInfo` to support per-platform executables (e.g. `PalServer.sh` on Linux). Resolve executable at runtime based on `process.platform`.

**Origin:** Code review — Windows-only `.exe` paths.

#### Acceptance criteria

- [x] `ServerInfo` supports `executable` string or `executables: Partial<Record<NodeJS.Platform, string>>`
- [x] `run-server`, `stop-server`, `isProcessRunning` use resolved executable
- [x] Unit tests cover win32 vs linux resolution for Palworld and Enshrouded
- [x] `npm test`, `npm run type-check` pass

### 005.2 — Platform-aware config and save paths

Palworld config is hardcoded to `Pal/Saved/Config/WindowsServer/PalWorldSettings.ini`. Add Linux (`LinuxServer`) and macOS overrides where applicable.

**Origin:** Code review — Windows-only config paths.

#### Acceptance criteria

- [x] `configLocation` and `saveLocation` support per-platform overrides
- [x] `get-server-config` / `save-server-config` resolve correct path per OS
- [x] Tests verify Linux config path for Palworld
- [x] `npm test`, `npm run lint` pass

### 005.3 — Document server catalog extension process

Add a short guide for contributing new `STEAM_DEDICATED_SERVERS` entries (app ID, folder names, executables per platform, config/save locations).

**Origin:** Code review — only 2 of documented 15 servers implemented.

#### Acceptance criteria

- [x] `STEAM_DETECTION.md` or new `docs/ADDING_SERVERS.md` documents the schema and steps
- [x] Example entry template included
- [x] README links to the guide

### 005.4 — Align ARCHITECTURE server count with reality

Docs claim the app scans "15 known server app IDs" (`ARCHITECTURE.md`, `STEAM_DETECTION.md`), but `STEAM_DEDICATED_SERVERS` contains 2 entries (Enshrouded, Palworld) — and the documented app IDs don't match the real ones. Update the docs to state the actual catalog and point to the extension guide (ticket 005.3) instead of a stale hardcoded list.

**Origin:** Code review — only 2 of documented 15 servers implemented. (Ticket file created during epic 005 execution; it was listed in the epic index but missing from the backlog.)

#### Acceptance criteria

- [x] `ARCHITECTURE.md` no longer claims 15 known server app IDs; reflects the real catalog
- [x] `STEAM_DETECTION.md` supported-servers table matches `STEAM_DEDICATED_SERVERS` (correct app IDs)
- [x] Docs reference the catalog extension guide for adding more servers
