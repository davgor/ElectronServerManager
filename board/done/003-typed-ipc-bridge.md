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

### 003.1 Whitelist allowed IPC channels in preload

Restrict `preload.ts` `invoke`/`send`/`on` to a fixed set of channel names. Log or reject unknown channels.

**Origin:** Code review — IPC security.

#### Acceptance criteria

- [x] `ALLOWED_CHANNELS` constant lists every channel registered in `main.ts`
- [x] Preload throws or no-ops on disallowed channels
- [x] `src/__tests__/preload/preload.test.ts` covers allowed and rejected channels
- [x] `npm test`, `npm run lint` pass

### 003.2 Define shared IPC types in `src/types/ipc.ts`

Create typed request/response interfaces for every IPC channel (`GetSteamServers`, `RunServer`, `BackupServerSave`, etc.).

**Origin:** Code review — typed IPC bridge epic.

#### Acceptance criteria

- [x] `src/types/ipc.ts` exports typed shapes for all 15+ IPC channels
- [x] Types are importable from main, preload, and renderer without circular deps
- [x] `src/__tests__/types/ipc.test.ts` validates type exports (compile-time + smoke)
- [x] `npm run type-check` passes

### 003.3 Expose typed API methods on preload context bridge

Replace generic `ipcRenderer.invoke` exposure with named methods (`getSteamServers`, `runServer`, etc.) and typed `windowControls`.

**Origin:** Code review — depends on 003.2.

#### Acceptance criteria

- [x] `preload.ts` exposes typed methods; generic `invoke` is not exposed to renderer (or is internal only)
- [x] `electron.d.ts` reflects the new typed `window.electron` API
- [x] Preload tests verify each method invokes the correct channel
- [x] `npm test`, `npm run type-check` pass

### 003.4 Migrate renderer to typed IPC

Update `App.tsx`, `ConfigEditor.tsx`, and `TitleBar.tsx` to use typed preload methods. Remove all `as { success: boolean; ... }` casts and related eslint disables.

**Origin:** Code review — depends on 003.3.

#### Acceptance criteria

- [x] No `eslint-disable @typescript-eslint/no-unsafe-call` for IPC in renderer
- [x] `App.test.tsx` mocks the new typed API shape
- [x] `npm test`, `npm run lint`, `npm run build` pass

## Acceptance criteria (epic)

- [x] Preload rejects unknown IPC channels
- [x] Renderer has zero `eslint-disable` for `no-unsafe-call` on IPC invocations
- [x] All IPC channels have typed request/response shapes
- [x] Preload and renderer tests updated; full suite passes
