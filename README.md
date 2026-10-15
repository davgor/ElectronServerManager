# Steam Server Manager

Desktop app for detecting and managing Steam dedicated servers. It finds
installed catalog servers, then lets you start/stop them, auto-restart on
crash, update game files via SteamCMD, schedule or run save backups, and edit
server config — all from a frameless Electron UI. Palworld servers also get a
REST admin panel and a live ops view when the in-game REST API is enabled;
Enshrouded servers get the same Admin / live ops / update-protection surfaces
over the Steam server query.

Built for personal server ops; kept intentionally small and explicit about what
it supports. Windows, Linux, and macOS are supported where the catalog defines
platform-specific executables and config paths (see
[docs/ADDING_SERVERS.md](docs/ADDING_SERVERS.md)).

## Features

- **Steam detection** — Scans Steam libraries for servers in the built-in catalog;
  shows Steam cover art when available
- **Multi-library Steam paths** — Prefer a Steam install when more than one exists
- **Run / stop** — Launch or shut down the dedicated server process
- **Server output** — View recent captured stdout/stderr for a managed server
- **Resource metrics** — Live CPU / RAM (current, average, p95) on the card
  while a managed server is running
- **Auto-restart** — Optional restart if a managed server crashes
- **Auto-update (game files)** — Optional SteamCMD update with verified
  completion against the remote buildid and automatic restart; see
  [docs/GAME_UPDATES.md](docs/GAME_UPDATES.md) (SteamCMD path configurable in
  the UI)
- **Save backups** — Manual backup or timed intervals to a folder you choose
- **Config editor** — View and edit JSON/INI server configs in-app, with search
  that filters the tree to matching keys; Enshrouded settings show an ⓘ
  tooltip with what each one does, plus its default and range where Keen
  documents them (from Keen's 1.0 server docs); the text is also each
  control's accessible description and shows inline on keyboard focus
- **Palworld Admin** — Modal for the documented Palworld REST API (info, players,
  metrics, kick/ban, announce, save, shutdown, etc.); requires `RESTAPIEnabled`
  in config
- **Palworld live ops** — Optional on-card polling of info/players/metrics while
  the server is running and REST is enabled (interval persisted per server)
- **Enshrouded Admin** — Modal with live status and the player list over the
  Steam server query (`queryPort`), a shortcut into the `userGroups` roles in
  config, and a confirmed Stop. Enshrouded's dedicated server has **no** remote
  admin API, so kick/ban/unban, announce and save are shown as unsupported
  (kick/ban in-game with an admin role password)
- **Enshrouded live ops** — Optional on-card polling of server name, the
  server-reported version string and players over the server query while the
  server is running (interval persisted per server)
- **Player-aware auto-update** — Palworld announces a reboot over REST and waits
  5 minutes; Enshrouded (no announce) defers the update while players are
  online and retries on the next check, leaving the server running if the
  player check fails
- **Palworld Mod Manager** — Import a downloaded mod `.zip`, auto-enable it,
  soft-disable, or permanently remove with restore of overwritten files (BLOB
  backups in SQLite). Official `Info.json` packages stage under
  `Mods/Workshop`; path-rooted zips deploy under `Pal/` or `Mods/`. Official
  loader support is Windows dedicated server only — restart after import to
  apply Workshop deployment.
- **Custom title bar** — Frameless window with minimize / maximize / close
- **App auto-update** — Packaged builds check GitHub Releases (NSIS / AppImage),
  with a manual **Check for updates** button and `DISABLE_AUTO_UPDATE=1` opt-out;
  see [docs/AUTO_UPDATE.md](docs/AUTO_UPDATE.md)

## Supported servers

Currently shipped catalog (SQLite; see [ARCHITECTURE.md](ARCHITECTURE.md)):

| App ID | Server | Optional features |
|--------|--------|-------------------|
| `2278520` | Enshrouded Dedicated Server | Query admin, live ops, defer update while players are online (Steam A2S; no remote kick/ban/announce/save) |
| `1623730` | Palworld Dedicated Server | REST admin, live ops, update announce |

Palworld includes Linux executable (`PalServer.sh`) and config-path overrides;
Enshrouded uses the Windows `.exe` (typically Wine/Proton on Linux).

### Adding a new game

1. Add a catalog migration (servers row + platform overrides as needed).
2. Optionally seed `rest_admin` / `live_ops` / `update_announce` plus REST
   **or** query metadata; register an adapter only if the protocol is new
   (single-packet Steam A2S games can reuse `a2s`).
3. Add tests; smoke-test detect → run/stop → config → backup (± Admin/ops).

Full runbook (schema, capability checklist, migration templates, adapter hook):
[docs/ADDING_SERVERS.md](docs/ADDING_SERVERS.md).

## Requirements

- Node.js compatible with the repo’s Electron/Vite toolchain
- Steam installed (for detection and installs)
- SteamCMD available for game auto-update flows (path configurable in the UI)
- For Palworld Admin / live ops: server config with `RESTAPIEnabled` (and related
  REST settings) — enable via **Edit Config** if the Admin button is disabled
- For Enshrouded Admin / live ops: nothing to enable — the server answers the
  Steam query on `queryPort` (default `15637`) whenever it is running

## Quick start

```bash
npm install
npm run dev
```

`npm run dev` (and `npm start`) compiles the main process, starts the Vite
dev server, and launches Electron once `http://localhost:5173` is ready.

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` / `npm start` | Dev: electron-build + Vite + Electron |
| `npm run dev:renderer` | Vite only |
| `npm run electron` | Electron after wait-on Vite |
| `npm run electron-build` | Compile main/preload (`tsc -p tsconfig.main.json`) |
| `npm run electron-dev` | Watch-compile main/preload |
| `npm run build` | Production Vite renderer build |
| `npm run dist` | Full package via electron-builder |
| `npm run dist-dev` | electron-builder `--dir` (unpacked) |
| `npm run lint` / `lint:fix` | ESLint on `src` (`--max-warnings 0`) |
| `npm run format` / `format:check` | Prettier on `src` |
| `npm run type-check` | `tsc --noEmit` |
| `npm test` | Jest (runs `electron-build` via `pretest`) |
| `npm run test:coverage` | Jest with coverage |
| `npm run audit:cve` | Fail if npm audit reports any vulnerability |
| `npm run deadcode` | `ts-prune` scan, fails only on **new** unused exports vs `.tsprune-ignore` |
| `npm run deadcode:refresh` | Regenerate the `.tsprune-ignore` baseline |
| `npm run fireguard` | Grade unit-test quality for changed modules (AST / flake / mutation gates) |

Pull requests also get a sticky **Coverage Report** comment (base vs head
totals + coverage on new lines) and a **Fireguard** test-quality report. See
[ARCHITECTURE.md](ARCHITECTURE.md) (Continuous integration).

## Architecture & docs

| Doc | Purpose |
|-----|---------|
| [ARCHITECTURE.md](ARCHITECTURE.md) | Process model, IPC map, file layout, stack versions |
| [docs/ADDING_SERVERS.md](docs/ADDING_SERVERS.md) | Extend the catalog + optional Admin/ops/update-protection capabilities (REST or query pattern) |
| [docs/AUTO_UPDATE.md](docs/AUTO_UPDATE.md) | GitHub Releases → electron-updater runbook |
| [docs/GAME_UPDATES.md](docs/GAME_UPDATES.md) | SteamCMD game-update flow + operator notes |
| [DOCUMENTATION_INDEX.md](DOCUMENTATION_INDEX.md) | Index of maintained docs |
| [docs/archive/](docs/archive/) | Historical / superseded write-ups |

AI/agent delivery rules: [`.ai-instructions.md`](.ai-instructions.md) and
[`.claude/skills/delivery-standards/SKILL.md`](.claude/skills/delivery-standards/SKILL.md).

## Board workflow

Work is tracked as markdown tickets under [`board/`](board/):

- `board/backlog/` — not started
- `board/in-progress/` — active
- `board/done/` — completed (epics may collapse sub-tickets)

Each ticket has a description and checkable acceptance criteria. Implementation
follows TDD for main/preload/IPC logic, then lint, format, tests, type-check,
and builds before criteria are checked off. See the
[complete-ticket](.claude/skills/complete-ticket/SKILL.md) skill for the full
flow.

## Stack

Electron **^39.8**, Vite **^7.3**, React **^18.2**, TypeScript **^5.3** — see
`package.json` for exact ranges. Deeper layout and IPC: [ARCHITECTURE.md](ARCHITECTURE.md).

## License

MIT — see `package.json`.
