# App auto-update runbook

Installed builds of Game Server Manager can check GitHub Releases for a newer
version, download it in the background, and restart to apply it silently
(Discord-style: no interactive NSIS wizard on the in-app update path).

## How a release becomes an update

1. Push (or merge) to `main` runs [`.github/workflows/release.yml`](../.github/workflows/release.yml).
2. The workflow bumps `package.json` patch version, tags `vX.Y.Z`, and builds
   Windows + Linux packages with electron-builder.
3. Release assets uploaded to the GitHub Release include:
   - Installers (`.exe` NSIS / portable, `.AppImage`, `.deb`)
   - Updater metadata: `latest.yml`, `latest-linux.yml`, and `*.blockmap`
4. A previously installed **packaged** app starts and `electron-updater` reads
   the GitHub feed (see `publish` in `electron-builder.json`). It checks once
   on launch, then again every **4 hours** while the app stays open. Overlapping
   checks are skipped when a check/download is already in flight or an update
   is ready. When a newer version is published, the update downloads in the
   background.
5. The UI banner prompts **Restart & Install**. That CTA calls
   `quitAndInstall(true, true)` (silent + relaunch). The app does **not** quit
   on its own when the download finishes — the user must click the button.
6. After restart the title bar version (`vX.Y.Z`) should match the release tag /
   `package.json`.

Dev runs (`npm start` / `npm run dev`) never hit the public update feed.

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
| Windows NSIS installer | Yes (`latest.yml`) |
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
   ready. (Optional: leave the app open past a poll interval / trigger a manual
   check via IPC `app-update-check` to confirm background polling.)
5. Choose **Restart & Install** — Windows NSIS should apply silently (no
   installer wizard); AppImage relaunches with the new binary (silent flag is a
   no-op there).
6. Confirm the title bar version matches the new release.
