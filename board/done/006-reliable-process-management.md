# EPIC: Reliable auto-update and process management

Auto-update does not actually trigger Steam updates — it waits 10 seconds and compares build IDs. Process stop uses broad `pkill -f` which can kill unrelated processes. Server spawn uses `shell: true` with quoted paths.

**Code review findings:**
- `auto-update-server` never invokes `steamcmd` or Steam CLI — updates only happen if Steam background already updated
- Fixed 10s `setTimeout` is arbitrary and unreliable
- `pkill -f "${exeName}"` matches any process with that name in its command line
- `spawn(quotedPath, [], { shell: true })` is fragile; prefer `spawn(exePath, [], { shell: false })`
- `run-server` returns `{ success: true }` before confirming the process stayed alive
- `stop-server` swallows kill failures silently

## Sub-tickets

| Id | Title |
|----|-------|
| 006.1 | Integrate `steamcmd` for forced app updates |
| 006.2 | Safer process spawn (no shell, verify startup) |
| 006.3 | Narrow process kill to tracked PIDs or cwd-scoped matching |
| 006.4 | Auto-update flow: stop → update → verify buildid → restart |

## Acceptance criteria (epic)

- [ ] Auto-update can trigger an actual Steam depot update when one is available
- [ ] Start/stop targets the correct server process, not similarly named ones
- [ ] Failed start/stop surfaces actionable errors to the renderer
- [ ] Integration tests mock steamcmd and child_process
