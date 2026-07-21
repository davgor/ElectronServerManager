# 035 — Non-disruptive Steam auto-update check

When “Auto-update & restart when available” is enabled, the cooldown path currently stops the server on every check, runs SteamCMD `app_update validate`, then restarts — even when no new build exists. That causes needless downtime every ~5 minutes.

**Fix:** compare the local appmanifest buildid to the remote public-branch buildid (via SteamCMD `app_info_print`) **before** stopping. Only stop → update → restart when the versions differ. If they match (or the remote check cannot be completed safely), leave the running server alone.

**Related:** epic 030 / 030.3 (deferred cheaper pre-check), `src/main/autoUpdate.ts`, `src/main/steamCmd.ts`.

## Acceptance criteria

- [x] Auto-update pre-check fetches remote public `buildid` without stopping the server or running `app_update`
- [x] When local and remote buildids match, `autoUpdateServer` returns `stage: "no-update"` and never calls `stopServer` / `startServer` / `runSteamCmdUpdate`
- [x] When buildids differ, existing stop → `+force_install_dir` + `app_update validate` → verify → restart flow still runs
- [x] When remote (or local) buildid cannot be determined, do not stop the server; return a clear error at a `checking` stage
- [x] Unit tests cover match / mismatch / check-failure paths; `npm run lint`, `npm test`, `npm run type-check`, `npm run deadcode`, `npm run test:diff-coverage`, `npm run electron-build` pass
- [x] `ARCHITECTURE.md` (and any auto-update runbook notes) describe the pre-check-before-stop behavior
