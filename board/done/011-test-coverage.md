# EPIC: Test coverage expansion

73 tests pass but coverage gaps exist: no ConfigEditor tests, IPC handlers untested beyond compile checks, React `act()` warnings in App tests, no integration test for auto-restart/auto-update flows.

**Code review findings:**
- `main.test.ts` only checks compiled JS shape — not handler behavior
- `App.test.tsx` emits `act()` warnings on state updates
- No tests for INI round-trip (until 002.1)
- No tests for window control IPC
- Renderer mocks generic `invoke` — won't catch typed API regressions (after 003.x)

## Sub-tickets

| Id | Title |
|----|-------|
| 011.1 | Add IPC handler unit tests (mock Electron) |
| 011.2 | Fix React `act()` warnings in App tests |
| 011.3 | Add integration-style tests for auto-restart detection |

## Acceptance criteria (epic)

- [x] Every IPC handler has at least one behavioral unit test
- [x] App tests run without `act()` warnings
- [x] Coverage report (`npm run test:coverage`) shows main IPC modules >70%

## Sub-tickets

### 011.1 — Add IPC handler unit tests

Test `run-server`, `stop-server`, `get-steam-servers`, config handlers with mocked `ipcMain` registration pattern or extracted pure functions.

**Origin:** Code review — main.test.ts only checks build output.

#### Acceptance criteria

- [x] Tests exist for at least run, stop, get-steam-servers, get/save config handlers
- [x] Tests use extracted modules from epic 002 where available
- [x] `npm test`, `npm run lint` pass

### 011.2 — Fix React `act()` warnings in App tests

Wrap async state updates in `waitFor` / `act` properly so test output is clean.

**Origin:** Code review — App.test.tsx warnings on `setSelectedPath`.

#### Acceptance criteria

- [x] `npm test` produces no `act(...)` warnings for App suite
- [x] Tests still cover path fetch, server display, and error retry
- [x] `npm test`, `npm run lint` pass

### 011.3 — Integration-style tests for auto-restart detection

Cover the renderer crash → auto-restart path end-to-end enough that regressions in polling, `autoRestartAppIds`, or stop-clears-restart are caught. Logic lives in `useSteamServers` (poll detects `isRunning` true → false while app id is in the auto-restart set, then calls `runServer`).

**Origin:** Epic 011 coverage gap — auto-restart/auto-update flows. Hook tests already cover some restart cases; this ticket adds integration-style coverage (App or dedicated suite) without confusing app `electron-updater` (epic 012) or SteamCMD `autoUpdate`.

#### Acceptance criteria

- [x] Tests cover: server was running → appears stopped on poll → `runServer` invoked when auto-restart is enabled for that app id
- [x] Tests cover: auto-restart disabled → `runServer` is not invoked on the same transition
- [x] Tests cover: user-initiated stop clears auto-restart (or equivalent) so restart does not fire after intentional stop
- [x] Prefer extending `useSteamServers.test.tsx` and/or a dedicated `App.autoRestart.test.tsx` — do not fight 011.2 edits to `App.test.tsx`
- [x] `npm test`, `npm run lint` pass
