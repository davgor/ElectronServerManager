# 040 — Fix NSIS silent auto-update (one-click installer)

In-app **Restart & Install** still opens the full Windows installer wizard. Epic 031 set `quitAndInstall(true, true)` (NSIS `/S`), but `electron-builder.json` still ships an **assisted** installer:

```json
"nsis": { "oneClick": false, "allowToChangeInstallationDirectory": true }
```

Assisted + custom-directory NSIS does not reliably stay silent on update (known electron-builder limitation). AI-TTRPG (`davgor/AI-DND-Matrix`) uses `oneClick: true` for Discord-style silent apply.

**Fix:** switch Windows NSIS packaging to one-click (per-user), keep silent `quitAndInstall(true, true)`, document the tradeoff (no custom install-dir page on first install).

**Related:** `board/done/031-smoother-app-auto-update.md`, `docs/AUTO_UPDATE.md`, item 1 / epic 037 research.

## Acceptance criteria

- [x] `electron-builder.json` NSIS uses `oneClick: true` and does **not** set `allowToChangeInstallationDirectory`
- [x] Unit test asserts the silent-update-friendly NSIS flags (and that assisted custom-dir is absent)
- [x] `docs/AUTO_UPDATE.md` notes one-click NSIS is required for silent in-app updates; first install no longer offers a directory page
- [x] `installAppUpdate` still calls `quitAndInstall(true, true)`
- [x] `npm run lint`, `npm test`, `npm run type-check`, `npm run deadcode`, `npm run format:check` pass
