# EPIC: Reliable auto-update and process management

Auto-update does not actually trigger Steam updates — it waits 10 seconds and compares build IDs. Process stop uses broad `pkill -f` which can kill unrelated processes. Server spawn uses `shell: true` with quoted paths.

**Code review findings:**
- `auto-update-server` never invokes `steamcmd` or Steam CLI — updates only happen if Steam background already updated
- Fixed 10s `setTimeout` is arbitrary and unreliable
- `pkill -f "${exeName}"` matches any process with that name in its command line
- `spawn(quotedPath, [], { shell: true })` is fragile; prefer `spawn(exePath, [], { shell: false })`
- `run-server` returns `{ success: true }` before confirming the process stayed alive
- `stop-server` swallows kill failures silently

## Acceptance criteria (epic)

- [x] Auto-update can trigger an actual Steam depot update when one is available
- [x] Start/stop targets the correct server process, not similarly named ones
- [x] Failed start/stop surfaces actionable errors to the renderer
- [x] Integration tests mock steamcmd and child_process

## Sub-tickets

| Id | Title |
|----|-------|
| 006.1 | Integrate `steamcmd` for forced app updates |
| 006.2 | Safer process spawn (no shell, verify startup) |
| 006.3 | Narrow process kill to tracked PIDs or cwd-scoped matching |
| 006.4 | Auto-update flow: stop → update → verify buildid → restart |

### 006.1 — Integrate `steamcmd` for forced app updates

Replace the 10-second sleep + buildid poll with an explicit `steamcmd +app_update <appId> validate` (or platform equivalent), with configurable steamcmd path.

**Origin:** Code review — auto-update is a no-op without background Steam.

#### Acceptance criteria

- [x] `auto-update-server` invokes steamcmd when available
- [x] Graceful fallback with clear error when steamcmd is not installed
- [x] Settings allow user to set steamcmd path
- [x] Unit tests mock steamcmd execution and timeout handling
- [x] `npm test`, `npm run lint` pass

### 006.2 — Safer process spawn without shell

Use `spawn(serverExePath, [], { cwd, detached, stdio, shell: false })` and verify the process is running after a short delay before returning success.

**Origin:** Code review — `shell: true` + quoted path in `run-server`.

#### Acceptance criteria

- [x] `run-server` spawns without `shell: true`
- [x] Handler returns failure if process exits within 2s or is not detectable via `isProcessRunning`
- [x] Unit tests cover spawn error and early-exit cases
- [x] `npm test`, `npm run lint` pass

### 006.3 — Narrow process kill scope

Replace broad `pkill -f` / `taskkill /IM` with PID tracking (store child PID on start) or cwd-scoped matching to avoid killing unrelated processes.

**Origin:** Code review — `stop-server` kill command too broad.

#### Acceptance criteria

- [x] Main process tracks PIDs for servers it started (in-memory map keyed by appId)
- [x] `stop-server` prefers tracked PID; falls back to name-based kill only when PID unknown
- [x] Tests verify stop targets correct PID
- [x] `npm test`, `npm run lint` pass

### 006.4 — Auto-update flow: stop → update → verify → restart

Orchestrate auto-update as an explicit state machine: stop server, run steamcmd, poll buildid with backoff, restart only on confirmed change.

**Origin:** Code review — depends on 006.1–006.3.

#### Acceptance criteria

- [x] Auto-update does not restart if buildid unchanged after steamcmd
- [x] Renderer receives progress/status events (or structured result with stage)
- [x] Tests cover happy path and no-update-available path
- [x] `npm test`, manual smoke on Windows if available (Windows unavailable; smoke-tested the real IPC path in Electron on Linux under Xvfb instead)
