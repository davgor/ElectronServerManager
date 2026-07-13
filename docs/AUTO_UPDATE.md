# App auto-update runbook

Installed builds of Game Server Manager can check GitHub Releases for a newer
version, download it in the background, and restart to apply it.

## How a release becomes an update

1. Push (or merge) to `main` runs [`.github/workflows/release.yml`](../.github/workflows/release.yml).
2. The workflow bumps `package.json` patch version, tags `vX.Y.Z`, and builds
   Windows + Linux packages with electron-builder.
3. Release assets uploaded to the GitHub Release include:
   - Installers (`.exe` NSIS / portable, `.AppImage`, `.deb`)
   - Updater metadata: `latest.yml`, `latest-linux.yml`, and `*.blockmap`
4. A previously installed **packaged** app starts, `electron-updater` reads the
   GitHub feed (see `publish` in `electron-builder.json`), and downloads when a
   newer version is published.
5. The UI banner prompts **Restart & Install**; after restart the title bar
   version (`vX.Y.Z`) should match the release tag / `package.json`.

Dev runs (`npm start`) never hit the public update feed.

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
   ready.
5. Choose **Restart & Install**.
6. Confirm the title bar version matches the new release.
