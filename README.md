# Steam Server Manager

Desktop app for detecting and managing Steam dedicated servers. It finds
installed catalog servers, then lets you start/stop them, auto-restart on
crash, update game files via SteamCMD, back up saves, and edit server config —
all from a frameless Electron UI.

Built for personal server ops; kept intentionally small and explicit about what
it supports.

## Features

- **Steam detection** — Scans Steam libraries for servers in the built-in catalog
- **Run / stop** — Launch or shut down the dedicated server process
- **Auto-restart** — Optional restart if a managed server crashes
- **Auto-update (game files)** — Optional SteamCMD update before/around runs
- **Save backups** — Copy save data to a folder you choose
- **Config editor** — View and edit JSON/INI server configs in-app
- **Custom title bar** — Frameless window with minimize / maximize / close
- **Multi-library Steam paths** — Prefer a Steam install when more than one exists

## Supported servers

Currently shipped catalog (see `src/main/steamDetection.ts`):

| App ID | Server |
|--------|--------|
| `2278520` | Enshrouded Dedicated Server |
| `1623730` | Palworld Dedicated Server |

To add another game, follow [docs/ADDING_SERVERS.md](docs/ADDING_SERVERS.md).

## Requirements

- Node.js compatible with the repo’s Electron/Vite toolchain
- Steam installed (for detection and installs)
- SteamCMD available for game auto-update flows (path configurable in the UI)

## Quick start

```bash
npm install
npm start
```

`npm start` compiles the main process, starts the Vite dev server, and launches
Electron once `http://localhost:5173` is ready.

## Scripts

| Script | Purpose |
|--------|---------|
| `npm start` | Dev: electron-build + Vite + Electron |
| `npm run dev` | Vite only |
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
| `npm run deadcode` | `ts-prune` unused export scan |

## Architecture & docs

| Doc | Purpose |
|-----|---------|
| [ARCHITECTURE.md](ARCHITECTURE.md) | Process model, IPC map, file layout, stack versions |
| [docs/ADDING_SERVERS.md](docs/ADDING_SERVERS.md) | How to extend the server catalog |
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

Electron **39.2.7**, Vite **7.3.0**, React **18**, TypeScript **5.3** — see
`package.json` for exact ranges. Deeper layout and IPC: [ARCHITECTURE.md](ARCHITECTURE.md).

## License

MIT — see `package.json`.
