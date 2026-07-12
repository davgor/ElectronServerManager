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

- [ ] Packaged app displays the same version as the GitHub release tag / `package.json`
- [ ] After a new GitHub Release is published with updater metadata, a previously installed build detects the update without manual download
- [ ] User can apply the update (restart/install) from the app
- [ ] Dev runs do not hit the public update feed
- [ ] `npm test`, `npm run lint`, `npm run type-check`, and relevant builds pass
