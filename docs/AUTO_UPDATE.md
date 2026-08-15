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
   the GitHub feed (see `publish` in `electron-builder.json`). The first check
   runs **~8 seconds after launch** (so startup work and the renderer finish
   before update traffic starts), then again every **4 hours** while the app
   stays open. Overlapping checks are skipped when a check/download is already
   in flight or an update is ready. When a newer version is published, the
   update downloads in the background.
5. The UI banner prompts **Restart and update**. That CTA calls
   `quitAndInstall(true, true)` (silent + relaunch). The app does **not** quit
   on its own when the download finishes — the user must click the button.
6. After restart the title bar version (`vX.Y.Z`) should match the release tag /
   `package.json`.

Dev runs (`npm start` / `npm run dev`) never hit the public update feed.
Setting `DISABLE_AUTO_UPDATE=1` in the environment disables update checks in
packaged builds too (useful for kiosk/managed installs and update-flow testing).

## Manual "Check for updates"

The main screen has a **Check for updates** button (next to the update banner).
It invokes the `app-update-check` IPC channel, which returns a structured
`ManualUpdateCheckResult` instead of a silent success:

| Outcome | UI message |
|---------|------------|
| `update-available` | `Update found: vX.Y.Z` |
| `up-to-date` | `No updates found — you're on the latest version.` |
| `disabled` | `Update checks are only available in installed builds.` (dev builds or `DISABLE_AUTO_UPDATE=1`) |
| `busy` | `An update is already downloading.` / `An update is ready to install.` / generic busy message |
| `error` | `Update check failed: <reason>` |

The button shows `Checking for updates…` immediately and is disabled while a
check is in flight.

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
4. Launch the older install — after the ~8s initial delay the banner should
   show update available / downloading / ready. (Optional: use the
   **Check for updates** button for immediate feedback, or leave the app open
   past a poll interval to confirm background polling.)
5. Choose **Restart and update** — Windows NSIS should apply silently (no
   installer wizard); AppImage relaunches with the new binary (silent flag is a
   no-op there).
6. Confirm the title bar version matches the new release.
