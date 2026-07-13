# EPIC: Dependency hygiene and dead code

`ts-prune` and code review found unused dependencies, dead exports, and orphaned IPC handlers.

**Code review findings:**
- `electron-is-dev` in `package.json` but main uses `process.env.NODE_ENV` directly
- `electron-store` in dependencies but never imported in `src/` — **resolved in 004.3** (`settingsStore.ts`); no 009.2 ticket needed
- `STEAM_DEDICATED_SERVERS_TYPED` exported but unused
- IPC handlers with no renderer callers: `get-app-version`, `check-diagnostics`, `set-backup-location` (latter already removed in 002)
- `fetchCoverArt` does network HEAD on every server scan (N+1 HTTP calls)

## Sub-tickets

| Id | Title |
|----|-------|
| 009.1 | Remove or wire `electron-is-dev` |
| 009.2 | ~~Wire `electron-store` (see 004.3) or remove dependency~~ — done in 004.3 |
| 009.3 | Remove dead exports and orphaned IPC |
| 009.4 | Cache or lazy-load Steam cover art URLs |

### 009.1 — Remove unused `electron-is-dev` dependency

Main process already uses `process.env.NODE_ENV`. Remove `electron-is-dev` from `package.json` and lockfile.

**Origin:** Code review — unused dependency.

#### Acceptance criteria

- [x] `electron-is-dev` removed from dependencies
- [x] `npm install`, `npm test`, `npm run electron-build` pass
- [x] `main.test.ts` comment updated if it references the package (N/A — already asserts `process.env.NODE_ENV`)

### 009.3 — Remove dead exports and orphaned IPC

Remove `STEAM_DEDICATED_SERVERS_TYPED` if still unused. Wire `get-app-version` to TitleBar/about UI, `check-diagnostics` to a diagnostics panel, or remove handlers with tests proving safe removal.

**Origin:** Code review — dead code.

#### Acceptance criteria

- [x] `ts-prune` clean for `steamDetection.ts` exports (`STEAM_DEDICATED_SERVERS_TYPED` removed; callers use `STEAM_DEDICATED_SERVERS`)
- [x] Orphaned IPC either has UI/tests or is removed from main + preload whitelist (`get-app-version` / `check-diagnostics` kept — preload tests + epic 012.1 will wire version UI; `set-backup-location` already removed in 002; `getAvailableDrives` no longer exported)
- [x] `npm run deadcode`, `npm test` pass

### 009.4 — Cache or lazy-load Steam cover art

`fetchCoverArt` runs a HEAD request per server on every scan. Cache URLs in memory or load images lazily in the renderer.

**Origin:** Code review — N+1 network calls on scan.

#### Acceptance criteria

- [x] Cover art URLs cached per appId (in-memory with TTL or persistent store)
- [x] Server scan completes without awaiting all HEAD requests (lazy load acceptable) — scan uses sync `steamCoverArtUrl`
- [x] Tests verify cache hit avoids duplicate fetch
- [x] `npm test`, `npm run lint` pass

## Acceptance criteria (epic)

- [x] `npm run deadcode` reports no unused exports in `src/`
- [x] Every `package.json` dependency is used in `src/` or build config (`electron-store` via settingsStore; `electron-is-dev` removed)
- [x] Every IPC handler has a renderer or test caller (or is removed)
- [x] Server scan does not block on sequential HTTP HEAD requests
