# 014 — `npm run dev` boots Electron

`npm run dev` currently starts Vite only, so developers who expect a full app session get a browser-only renderer. Make `dev` compile main/preload, start Vite, and launch Electron (same flow as today’s `npm start`).

## Acceptance criteria

- [x] `npm run dev` runs electron-build, Vite, and Electron (waits on localhost:5173)
- [x] `npm start` remains a working alias for the same full dev boot
- [x] Vite-only workflow remains available via `npm run dev:renderer`
- [x] README scripts table/docs match the new behavior
