# Architecture — Steam Server Manager

Desktop Electron app that detects Steam-installed dedicated servers, then
start/stop, auto-restart, SteamCMD update, backup, and edit config from a
frameless React UI.

## Technology stack

Versions match `package.json` (pin/range as declared there):

| Layer | Tech |
|-------|------|
| Desktop shell | Electron **41.10.5** |
| UI | React **^18.2**, TypeScript **^5.3** |
| Renderer bundler | Vite **7.3.0** |
| Packaging | electron-builder **^24.6** |
| App updates | electron-updater **^6.8** |
| Settings persistence | electron-store **^8.1** |
| Server catalog | better-sqlite3 (main process) |
| Dev env detection | `process.env.NODE_ENV` / `ELECTRON_START_URL` in main bootstrap |

Build outputs: renderer → Vite `dist/`; main/preload → `tsc -p tsconfig.main.json` → `dist/main/`, `dist/preload/`.

## Process model

```
┌─────────────────────────────────────────────────────────────┐
│ Electron                                                     │
│  ┌──────────────────────┐   IPC (typed)   ┌───────────────┐ │
│  │ Main (Node)          │◄───────────────►│ Renderer      │ │
│  │ src/main/*           │  via preload    │ React UI      │ │
│  │ frame: false window  │  allowlist      │ TitleBar +    │ │
│  │ Steam / process I/O  │                 │ ServerCard +  │ │
│  └──────────────────────┘                 │ ConfigEditor  │ │
│           ▲                               └───────────────┘ │
│           │ contextBridge                                    │
│  ┌────────┴─────────────┐                                   │
│  │ Preload              │                                   │
│  │ src/preload/preload  │                                   │
│  └──────────────────────┘                                   │
└─────────────────────────────────────────────────────────────┘
```

- **Main** owns Steam detection, process spawn/kill, SteamCMD updates, backups,
  config file I/O, settings store, and window chrome IPC.
- **Preload** exposes a narrow `window.electron` API; channels are allowlisted.
- **Renderer** never imports Node/Electron main APIs — only typed IPC.

Security baseline: `contextIsolation: true`, `nodeIntegration: false`, no
generic shell/exec IPC channel.

## File organization

```
src/
├── main/
│   ├── main.ts                 # App lifecycle, register handlers
│   ├── appWindow.ts            # Frameless BrowserWindow
│   ├── registerIpcHandlers.ts  # Most ipcMain.handle registrations
│   ├── windowControls.ts       # Minimize / maximize / close IPC
│   ├── steamDetection.ts       # Detection + path resolution helpers
│   ├── catalog/                # SQLite server catalog + migrations
│   ├── gameRest/               # REST adapter registry (Palworld first)
│   ├── mods/                   # Palworld mod manager (zip import, SQLite)
│   ├── steamIpc.ts             # Diagnostics / path listing helpers
│   ├── steamCmd.ts             # SteamCMD path + update helpers
│   ├── serverProcess.ts        # Run / stop server processes
│   ├── autoUpdate.ts           # Per-server SteamCMD update flow
│   ├── serverBackup.ts         # Save-folder backups
│   ├── serverConfig.ts         # Read/write server config files
│   ├── iniConfig.ts            # INI parse/serialize
│   ├── settingsStore.ts        # electron-store settings
│   ├── logger.ts               # Structured main-process logging
│   ├── serverOutputBuffer.ts   # Recent server stdout/stderr ring buffer
│   ├── appUpdater.ts           # electron-updater (packaged builds only)
│   └── driveUtils.ts           # Drive / path utilities
├── preload/
│   └── preload.ts              # contextBridge + channel allowlist
├── renderer/
│   ├── main.tsx / App.tsx      # Shell + server list
│   ├── TitleBar.tsx            # Custom window controls + app version
│   ├── UpdateBanner.tsx        # App auto-update status / restart CTA
│   ├── CheckForUpdatesButton.tsx # Manual app-update check + feedback
│   ├── manualCheckMessage.ts   # Manual-check result → UI copy/tone
│   ├── ServerCard.tsx          # Per-server actions
│   ├── ConfigEditor.tsx        # Nested JSON/INI editor
│   ├── PalworldAdminModal.tsx  # Palworld REST admin UI
│   ├── ModManagerModal.tsx     # Palworld mod zip import / enable / remove
│   ├── SteamPathSelector.tsx / SteamCmdPathInput.tsx
│   └── hooks/                  # useSteamServers, settings, backups
├── ci/                         # Pure CI helpers (kickback, coverage comments)
├── types/
│   ├── ipc.ts                  # Channel map + ElectronAPI
│   └── electron.d.ts           # Window.electron declaration
```

Ticket board lives under `/board` (`backlog/`, `in-progress/`, `done/`).

## Continuous integration

GitHub Actions runs lint, type-check, unit tests, dead-code, and security audit
on pushes/PRs. Failed required checks on direct `main`/`master` pushes can
trigger an automatic kickback revert (see `src/ci/kickbackPolicy.ts`).

The dead-code job is baseline-aware: `npm run deadcode` fails only on **new**
unused exports relative to `.tsprune-ignore` (`src/ci/deadcodePolicy.ts`,
`scripts/deadcode-check.cjs`); refresh the baseline with
`npm run deadcode:refresh` after intentional cleanups.

Pull requests also run **Fireguard** (`fireguard/`, vendored from BoosterSeat) —
a unit-test quality grader that inspects tests covering changed production
modules for mock-heavy/tautological assertions, flakiness (repeated runs), and
mutation-survival, then posts a sticky PR comment. Configured via
`.fireguardrc.json`; run locally with `npm run fireguard`.

On pull requests, **Coverage Report** runs Jest coverage on the base and head
SHAs and posts (or updates) a sticky comment with before/after totals and
coverage on newly added lines (`src/ci/coverageReport.ts`). That job is
informational and does not fail on coverage deltas.
## Server catalog

The known dedicated-server catalog lives in SQLite (`better-sqlite3`), opened
from `userData/server-catalog.sqlite` on app ready via `initCatalog()`. Schema
and seed data come from versioned migrations in `src/main/catalog/migrations/`.
`CatalogRepository` exposes `ServerInfo`-compatible records to detection,
process control, config I/O, and backups, plus **capability** and **REST
metadata** lookups for optional features.

### Tables

| Table | Purpose |
|-------|---------|
| `servers` | Core catalog row (name, folder, executable, save/config paths) |
| `server_platform_overrides` | Per-`win32`/`linux`/`darwin` path overrides |
| `server_capabilities` | Optional features: `rest_admin`, `live_ops`, `update_announce` |
| `server_rest_metadata` | REST adapter id, default port, config keys for enable/port/password |

Feature gating (Admin button, live ops panel, announce-before-update) reads
capabilities from the catalog — not a hardcoded Palworld app id. REST HTTP
shapes live in `src/main/gameRest/` adapters (Palworld is the first
`adapter_id`); only enablement and defaults come from SQLite.

Currently seeded (**2** entries):

| App ID | Name | Capabilities |
|--------|------|--------------|
| `2278520` | Enshrouded Dedicated Server | (none) |
| `1623730` | Palworld Dedicated Server | `rest_admin`, `live_ops`, `update_announce` |

Add games via a new migration — see [docs/ADDING_SERVERS.md](docs/ADDING_SERVERS.md).

## Mod manager persistence

Palworld mod import state lives in a separate SQLite DB
(`userData/mod-manager.sqlite`), not the static catalog. Tables track each
imported mod, every file change (`created` / `overwritten` / `settings`), and
BLOB backups of overwritten originals. Soft-disabled path-deploy file contents
are stashed under `userData/mod-stash/<modId>/`. Soft-disable for official
Workshop packages only edits `Mods/PalModSettings.ini` (`ActiveModList`).

## IPC channels

All handlers use `ipcMain.handle` (no `ipcMain.on` subscriptions). Registered in
`registerIpcHandlers.ts` and `windowControls.ts`; mirrored in preload
`ALLOWED_CHANNELS` and `src/types/ipc.ts`.

| Channel | Purpose |
|---------|---------|
| `get-app-version` | App version string |
| `check-diagnostics` | Environment / path diagnostics |
| `get-steam-paths` | Candidate Steam install paths |
| `get-steam-servers` | Installed catalog servers (+ optional preferred path) |
| `run-server` | Start dedicated server process |
| `stop-server` | Stop dedicated server process |
| `auto-update-server` | SteamCMD update for a server |
| `backup-server-save` | Copy save data to backup folder |
| `select-backup-folder` | Native folder picker for backups |
| `select-steamcmd-path` | Native file picker for SteamCMD executable |
| `get-server-config` | Load server config (JSON/INI) |
| `get-server-output` | Recent capped stdout/stderr for a server |
| `get-server-metrics` | CPU/RAM usage stats (current / average / p95) for a tracked server |
| `save-server-config` | Persist edited config |
| `open-file-default` | Open a path with the OS default app |
| `get-settings` / `save-settings` | Persisted UI/server flags |
| `app-update-check` | Manual app update check (structured `ManualUpdateCheckResult`) |
| `app-update-install` | Quit and install a downloaded app update |
| `palworld-rest-status` | Whether Palworld REST API is enabled in config |
| `palworld-rest-request` | Invoke a Palworld REST admin endpoint |
| `list-server-mods` | List imported mods for a Palworld install |
| `select-and-import-mod-zip` | Native zip picker + import/enable |
| `set-server-mod-enabled` | Soft enable/disable an imported mod |
| `remove-server-mod` | Permanently remove mod and restore backups |
| `window-minimize` | Frameless window minimize |
| `window-maximize-toggle` | Maximize / restore |
| `window-close` | Close window |

Push event (preload allowlisted, not invoke): `app-update-status` — app
auto-update state machine for the renderer banner.

Renderer calls typed methods on `window.electron` (e.g. `getSteamServers`,
`runServer`, `windowControls.minimize`, `onAppUpdateStatus`) — not raw channel
strings. The title bar shows `getAppVersion()` so a successful app update is
easy to confirm.

## Feature flows (high level)

1. **Detect** — `findInstalledServers()` resolves Steam path(s), parses
   `libraryfolders.vdf`, checks manifests for catalog app IDs, probes process
   status.
2. **Run / stop** — `serverProcess` spawns/kills the resolved executable.
3. **Auto-restart** — Renderer settings flag; polling in `useSteamServers`
   restarts if a watched server exits unexpectedly.
4. **Auto-update (game files)** — SteamCMD via `autoUpdate.ts` when enabled per
   server: read the local buildid from the manifest of the library that owns
   `installPath` (see `buildManifestCandidatePaths`) and compare to the remote
   public buildid (`app_info_print`, no stop) → only if they differ, optionally
   announce a 5-minute reboot warning via Palworld REST (when `RESTAPIEnabled`)
   and wait → stop → `+force_install_dir <installPath>` + `app_update validate`
   → verify the post-update manifest buildid **matches remote** (partial
   downloads fail at `verifying`) → always restart (matching versions leave
   the running server alone). Operator notes: [docs/GAME_UPDATES.md](docs/GAME_UPDATES.md).
5. **App auto-update** — Packaged builds use `electron-updater` (`appUpdater.ts`)
   against GitHub Releases metadata: first check ~8s after launch + every 4h
   while open (`DISABLE_AUTO_UPDATE=1` opts out), background download, silent
   apply on the **Restart and update** CTA. A manual **Check for updates**
   button returns structured checking / up-to-date / found / busy / disabled /
   error feedback; see [docs/AUTO_UPDATE.md](docs/AUTO_UPDATE.md).
6. **Backup** — Copies configured save location into a user-chosen backup root.
7. **Config editor** — Loads config over IPC; `ConfigEditor` edits nested
   values with type preservation; saves back through main.
8. **Palworld Mod Manager** — Zip import resolves Workshop `Info.json` or
   `Pal/`/`Mods/` paths, records changes + overwrite BLOBs, auto-enables;
   disable soft-removes; trash reverts.

## Design notes

- Main modules stay free of React/DOM; renderer stays free of Node FS/process.
- IPC responses are structured result objects (success / error) where applicable.
- Settings (`autoRestart`, `autoUpdate`, paths) persist via `electron-store`.
- Cover art and some path helpers exist in main; dead-code cleanup is epic 009.

## Performance (order-of-magnitude)

Initial scan is dominated by Steam path lookup, library VDF parse, per-catalog
manifest checks, and process probing — typically on the order of **1–2 seconds**
on a normal desktop. IPC itself is local (no network). UI re-renders stay
small for the current 2-server catalog.

## Security

- Context isolation + preload allowlist only
- No Node integration in the renderer
- No unrestricted `exec` / shell IPC
- File operations are scoped to Steam installs, config paths, and user-chosen
  backup directories

---

For product overview and scripts, see [README.md](README.md). For extending the
catalog, see [docs/ADDING_SERVERS.md](docs/ADDING_SERVERS.md).
