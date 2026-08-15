# EPIC: Reliable Steam game updates + host CPU/RAM metrics

Fix per-server SteamCMD game updates so a completed download does not leave Steam “stuck” at ~99.9% or require a manual Steam finish + manual server reboot. Then add process/host CPU and RAM tracking with current / average / p95. Implement **038.1 before 038.2** (user order: items 2 → 3).

**Related done work:** epics **030** (force_install_dir + restart), **035** (buildid pre-check), **036** (Palworld announce window). This epic addresses remaining production failures those tickets did not close.

## Research notes

### Item 2 — Game update stalls at ~99.9% / Steam must finish / manual reboot

Observed UX: update download appears to complete almost fully, then the operator still opens Steam to finish the update and must reboot the dedicated server manually.

Likely failure modes in current code (`src/main/autoUpdate.ts`, `steamCmd.ts`, `steamDetection.ts`):

1. **Wrong appmanifest path for buildid** — `getServerBuildId(appId, steamPath)` joins `steamPath` + `appmanifest_<id>.acf`. Unit tests pass a `…/steamapps` directory, but the renderer passes the **Steam install root** from path selection (`useSteamServers` → `autoUpdateServer(appId, installPath, path)`). Production therefore often looks for `\<SteamRoot>\appmanifest_*.acf` instead of `\<SteamRoot>\steamapps\appmanifest_*.acf`. Multi-library installs are worse: the live manifest lives next to `installPath` (`<library>/steamapps/`), not necessarily under the selected Steam root.

2. **SteamCMD vs Steam client ownership** — `+force_install_dir <installPath> +login anonymous +app_update <id> validate` can write depots into the install while the Steam client still holds `StateFlags` / pending download state for the same app. Symptom matches “99.9% in Steam until you click Finish.”

3. **Anonymous login limits** — some dedicated-server depots require a Steam account; anonymous can exit 0/7 after a partial sync. We treat exit `0` and `7` as success without asserting depot completeness against Steam’s expected size / buildid at the **library** manifest beside `installPath`.

4. **Verify + restart gaps** — after SteamCMD we re-read buildid via the same possibly-wrong `steamPath`, then `startServer`. If verify sees a stale/null buildid we may report `no-update` or restart an incompletely updated tree; if Steam still locks files, start can fail and the UI error is easy to miss during cooldown polling.

5. **No post-update reconciliation with Steam** — we never clear/sync Steam’s download state, never prefer reading/writing the manifest adjacent to `installPath`, and never fall back to a documented “use SteamCMD only” or “ask Steam to update then adopt” strategy.

**Target outcomes:** after auto-update, the managed install’s library manifest buildid matches remote, Steam client does not require a manual finish for that app, and the server process is running again without operator intervention (Palworld warn window from 036 still applies when REST is on).

### Item 3 — CPU/RAM current / average / p95

No host or per-server resource metrics exist today. `serverProcess` already tracks PIDs in `trackedPids` — that is the natural sampling source for per-server CPU/RAM. Need:

- Main-process sampler (Node/`process.cpuUsage` is wrong for child PIDs; use OS APIs or a small dependency such as `pidusage`)
- Rolling window stats: **current**, **average**, **p95** for CPU % and RAM (RSS bytes or MiB)
- Typed IPC + renderer surfacing on the server card (or a compact ops strip) without turning the first viewport into a dashboard of unrelated widgets
- Tests with injectable clock/samples

## Acceptance criteria (epic)

- [x] Auto-update resolves buildid from the library steamapps that owns `installPath` (not a guessed Steam root alone)
- [x] Successful auto-update leaves the install at the remote buildid and restarts the server without requiring a manual Steam “finish download” step in the happy path
- [x] Failures surface a clear stage/error when SteamCMD/Steam cannot fully apply (no silent 99.9% success)
- [x] Running managed servers expose CPU and RAM **current / average / p95** via IPC and UI
- [x] Unit tests cover manifest resolution, update completion checks, metric aggregation; verification gate passes

## Sub-tickets

| Id | Title | Maps to |
|----|-------|---------|
| 038.1 | Fix Steam game update completion + restart | Item 2 |
| 038.2 | CPU/RAM usage current / average / p95 | Item 3 |

### 038.1 — Fix Steam game update completion + restart

Make the SteamCMD update path authoritative for the detected install and prove completion before calling success.

**Investigate and implement (TDD):**

1. Resolve appmanifest from `installPath` (typically `../appmanifest_<appId>.acf` from `…/steamapps/common/<folder>`) with tests for Steam-root vs library vs multi-library layouts; stop trusting raw Steam-root `steamPath` alone.
2. After `app_update`, verify the **same** library manifest buildid matches the remote buildid (with existing backoff). If SteamCMD exits 0/7 but buildid unchanged or manifest missing, treat as failure and attempt restart + clear error.
3. Avoid leaving Steam client in a half-finished download state for the managed app — prefer strategies that work for dedicated servers (e.g. ensure SteamCMD writes the library manifest beside the install; document if Steam client must be closed; optional `steam://` is out of scope unless proven necessary).
4. Always restart after a stop (already intended); ensure start failures are visible in the renderer when cooldown auto-update fails.
5. Capture enough SteamCMD stdout on failure to diagnose anonymous/depot errors.

#### Acceptance criteria

- [x] `getServerBuildId` (or successor) reads the manifest for the library that contains `installPath`; unit tests cover common/library layouts
- [x] Auto-update success requires remote buildid == post-update library manifest buildid; partial downloads are `success: false` with stage `verifying` or `updating`
- [x] On success, server is running again without manual Steam finish or manual reboot in the automated happy-path tests
- [x] Documented operator notes for cases that still need Steam login / Steam client closed
- [x] `npm test` for autoUpdate/steamCmd/steamDetection + full verification gate pass

### 038.2 — CPU/RAM usage current / average / p95

Track resource usage for managed server processes (and optionally overall host summary if cheap).

**Design sketch:**

- Sampler in main, keyed by `appId`, using tracked PID; configurable interval (e.g. 2–5s)
- Ring buffer / rolling window (e.g. last 5–15 minutes) computing current, mean, and p95 for CPU% and memory
- IPC `get-server-metrics` (and/or push events) + preload allowlist + types
- UI on `ServerCard` when running: compact current + average + p95 (CPU / RAM) — one metrics job, not a card farm of unrelated promos

#### Acceptance criteria

- [x] While a server is tracked/running, metrics expose current, average, and p95 for CPU and RAM
- [x] When not running, metrics are empty/cleared (no stale PID samples)
- [x] Unit tests cover aggregation (p95/average) with fixture samples; IPC typed and tested
- [x] Renderer shows the three stats without breaking existing card actions
- [x] Verification gate passes; `ARCHITECTURE.md` IPC table updated
