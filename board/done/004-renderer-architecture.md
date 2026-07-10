# EPIC: Renderer architecture and state management

`App.tsx` is ~625 lines managing servers, auto-restart, auto-update, backups, and config editing in one component. Several settings are ephemeral (lost on restart) and `fetchServers` has fragile effect dependencies.

**Code review findings:**
- `fetchServers` depends on `servers`, `lastAutoUpdateTime` — risks stale closures and unnecessary re-fetches
- Auto-restart, auto-update, and backup intervals live only in React state (not persisted)
- Backup locations use `localStorage`; `electron-store` is in `package.json` but unused
- `get-steam-paths` returns multiple paths but UI always uses `paths[0]` — no library selector
- No loading indicator during 10s periodic refresh (only initial load)
- `ServerCard` UI is inline — not a reusable component

## Sub-tickets

| Id | Title |
|----|-------|
| 004.1 | Extract `useSteamServers` hook with stable polling |
| 004.2 | Extract `ServerCard` component |
| 004.3 | Persist server settings via `electron-store` |
| 004.4 | Add Steam library path selector UI |
| 004.5 | Fix `fetchServers` effect dependencies and auto-restart race |

### 004.1 Extract `useSteamServers` hook with stable polling

Move server fetching, path selection, and 10s/30s polling into a dedicated hook with stable callbacks (functional state updates, refs where needed).

**Origin:** Code review — App.tsx complexity.

#### Acceptance criteria

- [x] `src/renderer/hooks/useSteamServers.ts` owns fetch + poll logic
- [x] `fetchServers` does not close over stale `servers` array for change detection
- [x] Hook exposes `servers`, `loading`, `error`, `refresh`, `selectedPath`, `setSelectedPath`
- [x] Unit tests cover polling and error retry behavior
- [x] `npm test`, `npm run lint` pass

### 004.2 Extract `ServerCard` component

Split per-server UI (status, run/stop, settings, backup controls) from `App.tsx` into `src/renderer/ServerCard.tsx`.

**Origin:** Code review — App.tsx complexity.

#### Acceptance criteria

- [x] `ServerCard.tsx` renders a single server with all actions/settings
- [x] Props are typed; no prop-types needed (TypeScript)
- [x] `App.test.tsx` still passes; add focused `ServerCard.test.tsx`
- [x] `npm test`, `npm run lint`, `npm run build` pass

### 004.3 Persist server settings via `electron-store`

Wire `electron-store` (already a dependency) to persist auto-restart, auto-update, backup locations, and backup intervals. Replace ad-hoc `localStorage` for backups.

**Origin:** Code review — settings lost on restart; unused dependency.

#### Acceptance criteria

- [x] Main process exposes typed IPC to read/write settings (or preload wraps store in main)
- [x] Auto-restart, auto-update, backup path, and interval persist across sessions
- [x] `localStorage` usage for backups removed
- [x] Tests cover load/save round-trip
- [x] `npm test`, `npm run lint`, `npm run electron-build` pass

### 004.4 Add Steam library path selector UI

`get-steam-paths` can return multiple Steam roots but the app silently uses only the first. Add a dropdown or selector so users with games on `D:\SteamLibrary` can switch libraries.

**Origin:** Code review — multi-drive detection without UI.

#### Acceptance criteria

- [x] UI control lists all paths from `get-steam-paths`
- [x] Changing selection re-fetches servers for that path
- [x] Selection persists (via settings from 004.3 or local state until 004.3 lands)
- [x] Test: selector renders multiple paths and triggers refetch on change
- [x] `npm test`, `npm run build` pass

### 004.5 Fix auto-restart race and `fetchServers` dependencies

Auto-restart compares `servers` from closure during periodic refresh — can miss crashes or double-restart. Use refs or compare against previous snapshot inside the hook.

**Origin:** Code review — stale closure in `fetchServers` (lines 84–154 of `App.tsx`).

#### Acceptance criteria

- [x] Auto-restart uses previous server snapshot, not stale closure
- [x] Auto-update cooldown (`lastAutoUpdateTime`) does not cause `fetchServers` identity churn
- [x] `react-hooks/exhaustive-deps` satisfied without suppressions
- [x] Test: simulated crash triggers exactly one restart when enabled
- [x] `npm test`, `npm run lint` pass

## Acceptance criteria (epic)

- [x] `App.tsx` is under ~250 lines
- [x] User settings survive app restart
- [x] User can choose among detected Steam library roots
- [x] No `react-hooks/exhaustive-deps` suppressions
- [x] Renderer tests pass including new hook/component coverage
