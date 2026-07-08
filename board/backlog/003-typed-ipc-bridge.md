# EPIC: Typed IPC bridge

The preload script exposes a generic `invoke(channel, ...args)` with no channel whitelist. The renderer casts every IPC response with `as { success: boolean; ... }`, requiring numerous `eslint-disable @typescript-eslint/no-unsafe-call` suppressions.

**Code review findings:**
- `preload.ts` allows any channel string — violates Electron security best practice
- `electron.d.ts` defines only `SteamServer` and loose `ElectronAPI`; no per-channel types
- Renderer has 10+ unsafe IPC casts across `App.tsx` and `ConfigEditor.tsx`
- `windowControls` return types are `Promise<unknown>` in preload

## Sub-tickets

| Id | Title |
|----|-------|
| 003.1 | Whitelist allowed IPC channels in preload |
| 003.2 | Define shared IPC request/response types in `src/types/ipc.ts` |
| 003.3 | Expose typed API methods on preload context bridge |
| 003.4 | Migrate renderer to typed IPC (remove unsafe casts) |

## Acceptance criteria (epic)

- [ ] Preload rejects unknown IPC channels
- [ ] Renderer has zero `eslint-disable` for `no-unsafe-call` on IPC invocations
- [ ] All IPC channels have typed request/response shapes
- [ ] Preload and renderer tests updated; full suite passes
