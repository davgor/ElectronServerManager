# EPIC: Logging and observability

The codebase has 50+ `console.log` calls with `eslint-disable no-console` suppressions. Production debugging relies on unstructured stdout with no log levels or file output.

**Code review findings:**
- `steamDetection.ts` logs on every process check and manifest scan
- `main.ts` logs spawn stdout/stderr for every server
- ESLint `no-console` is warn-only but widely disabled per-line
- No user-visible log viewer for server output
- Periodic 10s refresh produces console noise in dev

## Sub-tickets

| Id | Title |
|----|-------|
| 010.1 | Introduce structured logger (`electron-log` or thin wrapper) |
| 010.2 | Gate debug logs behind `isDev` or log level |
| 010.3 | Surface recent server stdout in UI (optional polish) |

### 010.1 — Introduce structured logger

Add `electron-log` or a thin `src/main/logger.ts` wrapper with levels. Replace `console.log`/`console.error` in main and steamDetection.

**Origin:** Code review — logging sprawl.

#### Acceptance criteria

- [x] `src/main/logger.ts` exports `debug`, `info`, `warn`, `error`
- [x] Main process files use logger instead of raw console (except tests)
- [x] Logger writes to file in production (`enableFileLogging` under userData/logs)
- [x] `npm test`, `npm run lint` pass

### 010.2 — Gate debug logs behind `isDev` or log level

Verbose scan/process-check messages must not spam production. Default level is `debug` in development and `warn` in production; callers use `logger.debug` for noisy paths.

**Origin:** Code review — console noise; depends on 010.1.

#### Acceptance criteria

- [x] Default log level is `debug` when `NODE_ENV=development` or `ELECTRON_START_URL` is set; otherwise `warn`
- [x] `setLogLevel` / `getLogLevel` allow overriding the threshold
- [x] Noisy paths in `steamDetection` (process checks, library scans) use `debug` (or higher only for real failures)
- [x] Tests cover default levels and that below-threshold messages are dropped
- [x] `npm test`, `npm run lint` pass

### 010.3 — Surface recent server stdout in UI

Optional: keep a bounded ring buffer of recent stdout/stderr per running server and show it in the renderer so operators can diagnose failed starts without digging in console.

**Origin:** Code review — no user-visible server output; depends on process spawn piping in `serverProcess`.

#### Acceptance criteria

- [x] Main process retains a capped recent output buffer per `appId` while a server is started
- [x] Typed IPC exposes recent output to the renderer
- [x] Server card (or equivalent) can show recent output
- [x] Tests cover buffer capping / retrieval
- [x] `npm test`, `npm run lint`, `npm run electron-build` pass

## Acceptance criteria (epic)

- [x] No per-line `eslint-disable no-console` in main process (use logger; only transport in `logger.ts`)
- [x] Log level configurable (debug/info/warn/error)
- [x] Production default is warn+ ; dev default includes debug
- [x] `npm run lint` passes without console suppressions outside the logger transport
