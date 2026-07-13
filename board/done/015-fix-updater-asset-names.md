# 015 — Fix auto-updater 404 (GitHub asset name mismatch)

Packaged installs fail to download updates with HTTP 404 because `latest.yml` / `latest-linux.yml` reference hyphenated filenames (`Game-Server-Manager-Setup-…`) while `softprops/action-gh-release` uploads spaced `productName` artifacts that GitHub rewrites to dots (`Game.Server.Manager.Setup-…`).

## Acceptance criteria

- [x] `electron-builder.json` uses space-free `artifactName` patterns for Windows NSIS/portable and Linux AppImage outputs
- [x] Release workflow sanitizes spaced filenames and verifies `latest.yml` paths exist on disk before upload
- [x] `docs/AUTO_UPDATE.md` notes the no-spaces artifact naming rule
- [x] Repair script added for v1.0.22 (`scripts/repair-v1.0.22-assets.ps1`); next `main` release also produces matching names
- [x] `npm test` / lint / type-check pass
