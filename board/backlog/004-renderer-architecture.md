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

## Acceptance criteria (epic)

- [ ] `App.tsx` is under ~250 lines
- [ ] User settings survive app restart
- [ ] User can choose among detected Steam library roots
- [ ] No `react-hooks/exhaustive-deps` suppressions
- [ ] Renderer tests pass including new hook/component coverage
