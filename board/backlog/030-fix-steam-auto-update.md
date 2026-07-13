# EPIC: Fix Steam game auto-update (install dir + restart)

Per-server “Auto-update & restart when available” still does not reliably update through Steam. Epic 006 replaced the old sleep+buildid no-op with a SteamCMD state machine, but the current flow has two correctness bugs that make it unsafe and often ineffective.

**Findings (2026-07-13 review):**
- `runSteamCmdUpdate` runs `+login anonymous +app_update <appId> validate +quit` with **no** `+force_install_dir`. SteamCMD then updates its own default library, not the detected server `installPath`. Buildid is still read from the Steam client library manifest, so updates can land elsewhere while the app reports `no-update`.
- `autoUpdateServer` always **stops** the server before SteamCMD, then restarts **only** when buildid changes. On `no-update` (or SteamCMD failure after stop), the process stays down. Unit tests currently assert that wrong behavior.
- Renderer still triggers a full stop+validate every 5 minutes while the server is running (disruptive even when healthy).

**Related:** epic 006 (`board/done/006-reliable-process-management.md`) — SteamCMD integration; this epic closes remaining gaps.

## Acceptance criteria (epic)

- [ ] SteamCMD updates the detected server install directory (`+force_install_dir` using `installPath`)
- [ ] After a successful update check, a previously running server is running again whether or not buildid changed (unless stop/start itself fails)
- [ ] SteamCMD failure after stop attempts restart (or surfaces a clear error that the server was left stopped)
- [ ] Unit tests cover install-dir args, no-update restart, and post-failure restart; existing wrong “do not restart on no-update” expectations are corrected
- [ ] `npm run lint`, `npm test`, `npm run type-check`, `npm run deadcode`, `npm run electron-build` pass

## Sub-tickets

| Id | Title |
|----|-------|
| 030.1 | Pass `+force_install_dir` into SteamCMD update |
| 030.2 | Always restart after stop (no-update and update-failure paths) |
| 030.3 | Soften auto-update polling (optional / follow-up) |

### 030.1 — Pass `+force_install_dir` into SteamCMD update

Thread `installPath` into `runSteamCmdUpdate` and invoke SteamCMD as:

`+force_install_dir <installPath> +login anonymous +app_update <appId> validate +quit`

(order matters: force_install_dir before login/app_update).

**Origin:** Review — SteamCMD ignored the managed install path.

#### Acceptance criteria

- [ ] `runSteamCmdUpdate` accepts and passes `installPath` as `+force_install_dir`
- [ ] `autoUpdateServer` / IPC path supplies the server `installPath` already available to the handler
- [ ] Unit tests assert spawn argv includes `+force_install_dir` and the install path before `+app_update`
- [ ] `npm test` for `steamCmd` / `autoUpdate` passes

### 030.2 — Always restart after stop (no-update and failure)

After a successful stop, if the flow intended to bring the server back up (normal auto-update check), call `startServer` when:
- buildid unchanged (`no-update`), and/or
- SteamCMD fails after stop (best-effort restart + preserve the update error)

Keep “restart only on confirmed change” as the **update applied** signal (`updated: true`), not as “whether to start again.”

**Origin:** Review — checkbox implies keep running; no-update currently leaves the server stopped.

#### Acceptance criteria

- [ ] `stage: "no-update"` still means no depot change, but `startServer` was called after stop
- [ ] SteamCMD failure after stop attempts restart; result still reports `success: false` with stage `updating` (or equivalent) and a clear error
- [ ] Tests that previously expected `startServer` not called on no-update are updated and pass
- [ ] `npm test` for `autoUpdate` passes

### 030.3 — Soften auto-update polling (optional / follow-up)

Today `useSteamServers` stops+validates every 5 minutes while running. Prefer a cheaper check (e.g. compare remote/build availability, or run SteamCMD only when a cheap signal says an update may exist) so healthy servers are not interrupted on a timer. Can slip if 030.1–030.2 land first and downtime is limited to real update windows.

**Origin:** Review — cooldown still runs a full disruptive validate loop.

#### Acceptance criteria

- [ ] Documented decision: implement cheaper check **or** explicitly defer with rationale in this ticket
- [ ] If implemented: no full stop+validate on every cooldown tick unless an update is indicated; covered by hook/unit tests
- [ ] `npm test` / lint pass for touched files
