# EPIC: Smoother app auto-update (poll + silent install)

Packaged builds already use `electron-updater` against GitHub Releases (epic 012): check on startup, auto-download, banner with **Restart & Install**. Two gaps keep the experience farther from Discord-style updates:

1. **No polling while the app stays open** — updates published after launch are only seen on the next restart.
2. **Install is not silent** — `quitAndInstall(false, true)` plus NSIS (`oneClick: false`, custom install dir) can show the full installer UI instead of quietly applying and relaunching.

**Related:** epic 012 (`board/done/012-app-auto-update.md`), `src/main/appUpdater.ts`, `docs/AUTO_UPDATE.md`. Portable / `.deb` remain manual-update only.

## Acceptance criteria (epic)

- [x] Packaged app polls for updates on a fixed interval while running (in addition to the existing startup check)
- [x] Applying a downloaded update uses a silent install path (no interactive NSIS wizard); app relaunches on the new version
- [x] Update banner UX still covers checking / downloading / ready / error; ready state still requires an explicit restart CTA (no surprise quit)
- [x] Unit tests cover interval scheduling (or injectable timer) and silent `quitAndInstall` args; unpackaged/dev still skips real checks
- [x] `docs/AUTO_UPDATE.md` notes polling + silent install; `npm run lint`, `npm test`, `npm run type-check`, `npm run deadcode`, `npm run electron-build` pass

## Sub-tickets

| Id | Title |
|----|-------|
| 031.1 | Poll for app updates on an interval |
| 031.2 | Silent `quitAndInstall` on Restart & Install |
| 031.3 | Document Discord-like update flow |

### 031.1 — Poll for app updates on an interval

Extend `registerAppUpdater` so packaged builds call `checkForUpdates` periodically (e.g. every 4 hours; make the interval injectable for tests). Keep the existing one-shot check on register. Skip when unpackaged/dev. Avoid overlapping checks if a previous check/download is in flight.

**Origin:** User request — detect updates without restarting the app first.

#### Acceptance criteria

- [x] Packaged builds schedule recurring update checks after the initial startup check
- [x] Interval is configurable/injectable in tests; overlapping checks are skipped or coalesced
- [x] Unpackaged/dev still does not hit the public feed
- [x] Unit tests cover interval registration and “skip when not packaged”
- [x] `npm test` for `appUpdater` passes

### 031.2 — Silent `quitAndInstall` on Restart & Install

Change `installAppUpdate` to call `quitAndInstall(true, true)` (`isSilent=true`, `isForceRunAfter=true`) so Windows NSIS updates apply without the interactive installer UI. Confirm Linux AppImage path still works (electron-updater’s silent flag is a no-op / safe there). Do **not** auto-quit when download completes — keep the existing ready banner + user CTA.

**Origin:** User request — smoother apply, like Discord; today `quitAndInstall(false, true)` can surface the NSIS wizard.

#### Acceptance criteria

- [x] `installAppUpdate` uses silent + force-run-after (`quitAndInstall(true, true)` or equivalent)
- [x] Unit test expectation updated from `(false, true)` to `(true, true)`
- [x] Ready-state banner still requires explicit **Restart & Install** (no auto-quit on download)
- [x] `npm test` for `appUpdater` / `UpdateBanner` passes

### 031.3 — Document Discord-like update flow

Update `docs/AUTO_UPDATE.md` (and a brief note in `ARCHITECTURE.md` if needed) so the runbook matches reality: startup + interval poll, background download, silent apply on restart CTA, which artifacts still need manual reinstall.

#### Acceptance criteria

- [x] Runbook describes polling interval and silent install behavior
- [x] Verification checklist still works for NSIS / AppImage
- [x] No stale “installer wizard” language for the in-app update path
