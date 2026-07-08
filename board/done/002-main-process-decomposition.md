# EPIC: Main process decomposition

`src/main/main.ts` is ~840 lines mixing window lifecycle, 15+ IPC handlers, and a full INI parser/stringifier. This makes the main process hard to test, review, and extend.

**Code review findings:**
- INI helpers (`parseIniContent`, `stringifyIniContent`) live inline in `main.ts` (~190 lines)
- Server lifecycle (`run-server`, `stop-server`, `auto-update-server`) duplicates kill/spawn logic
- Config and backup handlers are interleaved with unrelated window IPC
- `main.test.ts` only verifies compiled output — no behavioral tests for IPC handlers

## Sub-tickets

| Id | Title |
|----|-------|
| 002.1 | Extract INI parse/stringify into `src/main/iniConfig.ts` |
| 002.2 | Extract server lifecycle IPC into `src/main/serverProcess.ts` |
| 002.3 | Extract config IPC handlers into `src/main/serverConfig.ts` |
| 002.4 | Extract backup IPC handlers into `src/main/serverBackup.ts` |
| 002.5 | Slim `main.ts` to app bootstrap + handler registration only |

### 002.1 — Extract INI parse/stringify into `src/main/iniConfig.ts`

Move `parseIniContent` and `stringifyIniContent` out of `src/main/main.ts` into a dedicated module. Add TDD-first unit tests for edge cases (quoted values, parenthesized tuples, section headers).

**Origin:** Code review — main process god file.

#### Acceptance criteria

- [x] `src/main/iniConfig.ts` exports `parseIniContent` and `stringifyIniContent`
- [x] `main.ts` imports from `iniConfig.ts`; no INI logic remains inline
- [x] `src/__tests__/main/iniConfig.test.ts` covers round-trip for Palworld-style INI snippets
- [x] `npm test`, `npm run lint`, `npm run type-check` pass

### 002.2 — Extract server lifecycle IPC into `src/main/serverProcess.ts`

Consolidate duplicated kill-command construction and spawn logic from `run-server`, `stop-server`, and `auto-update-server` into shared helpers.

**Origin:** Code review — duplicated platform-specific kill/spawn in three handlers.

#### Acceptance criteria

- [x] `src/main/serverProcess.ts` exports `startServer`, `stopServer`, and shared kill helper
- [x] `main.ts` IPC handlers delegate to `serverProcess.ts`
- [x] Kill/spawn logic is defined once (no copy-paste between run/stop/auto-update)
- [x] Unit tests mock `child_process` and cover win32 vs unix kill commands
- [x] `npm test`, `npm run lint`, `npm run type-check` pass

### 002.3 — Extract config IPC handlers into `src/main/serverConfig.ts`

Move `get-server-config` and `save-server-config` handlers (and their STEAM_DEDICATED_SERVERS lookups) out of `main.ts`.

**Origin:** Code review — main process decomposition.

#### Acceptance criteria

- [x] `src/main/serverConfig.ts` exports handler functions registered by `main.ts`
- [x] Config read/write behavior unchanged for Enshrouded (JSON) and Palworld (INI)
- [x] Unit tests cover missing config mapping, missing file, and successful read/write
- [x] `npm test`, `npm run lint`, `npm run type-check` pass

### 002.4 — Extract backup IPC handlers into `src/main/serverBackup.ts`

Move `backup-server-save`, `set-backup-location`, and `select-backup-folder` handlers out of `main.ts`. Co-locate with `backupServerSave` in `steamDetection.ts` or re-export from a backup module.

**Origin:** Code review — main process decomposition; `set-backup-location` IPC is unused by renderer.

#### Acceptance criteria

- [x] Backup-related IPC lives in `src/main/serverBackup.ts` (or cohesive backup module)
- [x] `set-backup-location` is either wired from renderer or removed with tests updated
- [x] Unit tests cover backup IPC success and validation failure paths
- [x] `npm test`, `npm run lint`, `npm run type-check` pass

### 002.5 — Slim `main.ts` to bootstrap + handler registration

After 002.1–002.4, refactor `main.ts` to only handle app lifecycle, window creation, and IPC registration.

**Origin:** Code review — depends on 002.1–002.4.

#### Acceptance criteria

- [x] `main.ts` is under ~200 lines
- [x] No business logic remains inline (only wiring)
- [x] `npm run electron-build` and full test suite pass
- [x] Manual smoke: app launches, servers list loads, run/stop still work

## Acceptance criteria (epic)

- [x] `main.ts` is under ~200 lines (bootstrap, window, handler wiring)
- [x] INI logic has dedicated unit tests independent of Electron mocks
- [x] Server lifecycle kill/spawn logic is defined once and reused by run/stop/auto-update
- [x] All existing tests pass; new module tests added per sub-ticket
