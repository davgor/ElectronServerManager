# EPIC: App auto-update from GitHub Releases

Installed builds of Game Server Manager should check GitHub Releases for a newer version, download it, and apply the update with minimal user friction. The running app version must be visible in the UI so a successful update is easy to confirm.

**Current state:**
- CI already bumps `package.json`, tags `vX.Y.Z`, and uploads Windows/Linux installers via `.github/workflows/release.yml`
- `electron-builder` is invoked with `--publish never`, so update metadata (`latest.yml` / `latest-linux.yml`, blockmaps) is not published
- `get-app-version` IPC + preload API exist but have no renderer caller (also noted in 009)
- No `electron-updater` (or equivalent) integration in the main process

**Scope notes:**
- Target installed packages that support auto-update (Windows NSIS; Linux AppImage). Portable/deb may be out of scope or documented as manual-update only.
- Updates should be quiet in the background, with a clear prompt before restart/install.
- Dev (`npm start`) must not attempt real GitHub updates.

## Sub-tickets

| Id | Title |
|----|-------|
| 012.1 | Show app version in the UI |
| 012.2 | Publish electron-updater metadata from GitHub Releases |
| 012.3 | Integrate `electron-updater` in the main process |
| 012.4 | Update UX: notify, download progress, restart to apply |
| 012.5 | Document release + auto-update runbook |

## Acceptance criteria (epic)

- [x] Packaged app displays the same version as the GitHub release tag / `package.json`
- [x] After a new GitHub Release is published with updater metadata, a previously installed build detects the update without manual download
- [x] User can apply the update (restart/install) from the app
- [x] Dev runs do not hit the public update feed
- [x] `npm test`, `npm run lint`, `npm run type-check`, and relevant builds pass

## Sub-tickets

### 012.1 — Show app version in the UI

Wire the existing `getAppVersion` preload API into the renderer so the installed app version is always visible (e.g. header/footer or about strip). This is the primary way to confirm an auto-update landed.

**Depends on:** none (IPC already exists).

#### Acceptance criteria

- [x] Renderer calls `window.electronAPI.getAppVersion()` (or current typed API) on load
- [x] Version string is shown in the main UI without navigating elsewhere
- [x] Displayed value matches `app.getVersion()` / packaged `package.json` version
- [x] Component or hook test covers successful version render (and a failure/empty fallback if applicable)
- [x] `npm test`, `npm run lint` pass

### 012.2 — Publish electron-updater metadata from GitHub Releases

Change packaging/release so GitHub Releases include the files `electron-updater` needs (`latest.yml` / `latest-linux.yml`, blockmaps, and correctly named installers), not only the installer binaries.

**Depends on:** none (CI/config only). May land before or with 012.3.

#### Acceptance criteria

- [x] `electron-builder.json` has a GitHub `publish` provider (owner/repo or inferred from git remote)
- [x] Release workflow publishes updater metadata for supported targets (at minimum Windows NSIS + Linux AppImage)
- [x] A new GitHub Release contains `latest.yml` (Windows) and the matching Linux metadata where AppImage is shipped
- [x] Version on the release matches the bumped `package.json` / tag used by the installed app
- [x] Documented which artifact types auto-update vs manual-only (e.g. portable)

### 012.3 — Integrate `electron-updater` in the main process

Add `electron-updater` and check GitHub Releases for updates when a packaged build starts (and optionally on an interval). Keep logic out of the renderer; expose status via typed IPC/events as needed by 012.4.

**Depends on:** 012.2 for a real feed; can be developed against mocks/tests first.

#### Acceptance criteria

- [x] `electron-updater` is a production dependency and configured for the GitHub provider
- [x] Main process module (e.g. `src/main/appUpdater.ts`) owns check/download/quitAndInstall
- [x] Update checks run only in packaged builds (skip when `isDev` / unpackaged)
- [x] Unit tests cover: no-update, update-available, download-complete, and error paths (mock `autoUpdater`)
- [x] Typed IPC and/or preload events exist for update status (even if UI is unfinished until 012.4)
- [x] `npm test`, `npm run lint`, `npm run electron-build` pass

### 012.4 — Update UX: notify, download progress, restart to apply

Surface auto-update state in the UI so the user knows when an update is available, downloading, or ready to install, and can confirm restart/apply.

**Depends on:** 012.1 (version visible), 012.3 (main-process updater + IPC/events).

#### Acceptance criteria

- [x] When an update is available, the UI shows a clear non-blocking notice (version from → to)
- [x] Download progress is visible when a download is in progress (or a determinate/indeterminate indicator if percent is unavailable)
- [x] When ready, user can trigger restart/install; app calls the main-process apply path
- [x] Failures show a short error message without crashing the app
- [x] Renderer tests cover notice/actions with mocked update events
- [x] `npm test`, `npm run lint`, `npm run build` pass

### 012.5 — Document release + auto-update runbook

Document how releases produce updater metadata, which platforms auto-update, and how to verify an update end-to-end (including using the in-app version string).

**Depends on:** 012.2–012.4 ideally done so docs match shipped behavior.

#### Acceptance criteria

- [x] README (or linked doc) explains: push/release → GitHub Release assets → app checks → user restarts
- [x] Notes which installers support auto-update vs manual reinstall
- [x] Includes a short verification checklist (install old build, publish newer release, confirm version bump in UI)
- [x] Architecture/docs mention `electron-updater` and where version is displayed (coordinate with 008 if that epic is still open)
