# App auto-update runbook

Installed builds of Game Server Manager can check GitHub Releases for a newer
version, download it in the background, and restart to apply it silently.

## How a release becomes an update

1. Push (or merge) to `main` runs [`.github/workflows/release.yml`](../.github/workflows/release.yml).
2. The workflow bumps `package.json` patch version, tags `vX.Y.Z`, and builds
   Windows + Linux packages with electron-builder.
3. Release assets uploaded to the GitHub Release include:
   - Installers (`.exe` NSIS / portable, `.AppImage`, `.deb`)
   - Updater metadata: `latest.yml`, `latest-linux.yml`, and `*.blockmap`
4. A previously installed **packaged** app:
   - Checks the GitHub feed on startup (`publish` in `electron-builder.json`)
   - Polls again every **4 hours** while the app stays open (so releases
     published after launch are still detected without a manual restart)
   - Downloads automatically when a newer version is published
5. The UI banner prompts **Restart & Install**. That CTA is required — download
   completion does **not** quit the app. Apply uses a **silent**
   `quitAndInstall` path (no interactive NSIS wizard); the app relaunches on the
   new version. (On AppImage the silent flag is a no-op; relaunch still works.)
6. After restart the title bar version (`vX.Y.Z`) should match the release tag /
   `package.json`.

Dev runs (`npm start` / `npm run dev`) never hit the public update feed and do
not schedule poll checks.

## Artifact naming (required for GitHub)

Release filenames must **not contain spaces**. GitHub Releases rewrites spaces to
dots (e.g. `Game.Server.Manager.Setup.…`), while `latest.yml` from
electron-builder uses hyphens (`Game-Server-Manager-Setup-…`). A mismatch causes
auto-update downloads to 404.

`electron-builder.json` sets space-free `artifactName` patterns, and the release
workflow sanitizes/verifies filenames before upload.

If an already-published release has this mismatch (e.g. v1.0.22), either publish a
newer fixed release from `main`, or re-upload hyphenated copies of the assets
(see `scripts/repair-v1.0.22-assets.ps1`).

## Which artifacts auto-update

| Artifact | Auto-update? |
|----------|----------------|
| Windows NSIS installer | Yes (`latest.yml`) — silent apply on Restart & Install |
| Linux AppImage | Yes (`latest-linux.yml`) |
| Windows portable `.exe` | Manual reinstall |
| Linux `.deb` | Manual reinstall |
| macOS targets | Not part of the current release matrix |

## Verification checklist

1. Install an older NSIS or AppImage build.
2. Confirm the title bar shows that older version (e.g. `v1.0.18`).
3. Publish a newer GitHub Release that includes `latest.yml` /
   `latest-linux.yml` and matching installers (normal `main` release workflow).
4. Launch the older install — banner should show update available / downloading /
   ready (startup check). Optionally leave the app open past the poll interval
   (or wait for a release published after launch) to confirm interval detection.
5. Choose **Restart & Install**. Confirm no interactive installer wizard appears
   (NSIS should apply quietly and relaunch).
6. Confirm the title bar version matches the new release.
