# 023 — Packaged app crashes: Cannot find module '../types/ipc'

After update, Game Server Manager fails to launch with a main-process uncaught exception:

`Error: Cannot find module '../types/ipc'`

Require stack starts at `dist/main/palworldRest.js` → `palworldRestIpc.js` → `registerIpcHandlers.js` → `main.js`.

Root cause: `palworldRest.ts` runtime-imports `PALWORLD_APP_ID` from `src/types/ipc.ts`, so `tsc` emits `require("../types/ipc")` → `dist/types/ipc.js`. `electron-builder.json` only packs `dist/main`, `dist/preload`, and `dist/renderer`, so `dist/types` is omitted from the asar.

## Acceptance criteria

- [x] `electron-builder.json` `files` includes `dist/types/**/*` (or equivalent) so shared type/value modules ship in the package
- [x] Unit test fails if packaged files omit `dist/types` while main can require it
- [x] `npm test`, `npm run lint`, `npm run format:check`, `npm run type-check`, and `npm run electron-build` pass
