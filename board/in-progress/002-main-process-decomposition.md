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

## Acceptance criteria (epic)

- [ ] `main.ts` is under ~200 lines (bootstrap, window, handler wiring)
- [ ] INI logic has dedicated unit tests independent of Electron mocks
- [ ] Server lifecycle kill/spawn logic is defined once and reused by run/stop/auto-update
- [ ] All existing tests pass; new module tests added per sub-ticket
