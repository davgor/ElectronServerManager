# EPIC: Dependency hygiene and dead code

`ts-prune` and code review found unused dependencies, dead exports, and orphaned IPC handlers.

**Code review findings:**
- `electron-is-dev` in `package.json` but main uses `process.env.NODE_ENV` directly
- `electron-store` in dependencies but never imported in `src/`
- `STEAM_DEDICATED_SERVERS_TYPED` exported but unused
- IPC handlers with no renderer callers: `get-app-version`, `check-diagnostics`, `set-backup-location`
- `fetchCoverArt` does network HEAD on every server scan (N+1 HTTP calls)

## Sub-tickets

| Id | Title |
|----|-------|
| 009.1 | Remove or wire `electron-is-dev` |
| 009.2 | Wire `electron-store` (see 004.3) or remove dependency |
| 009.3 | Remove dead exports and orphaned IPC |
| 009.4 | Cache or lazy-load Steam cover art URLs |

## Acceptance criteria (epic)

- [ ] `npm run deadcode` reports no unused exports in `src/`
- [ ] Every `package.json` dependency is used in `src/` or build config
- [ ] Every IPC handler has a renderer or test caller (or is removed)
- [ ] Server scan does not block on sequential HTTP HEAD requests
