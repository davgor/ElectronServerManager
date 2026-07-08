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
| 010.3 | Optional: surface recent server stdout in UI |

## Acceptance criteria (epic)

- [ ] No per-line `eslint-disable no-console` in main process (use logger)
- [ ] Log level configurable (debug/info/warn/error)
- [ ] Production default is warn+ ; dev default includes debug
- [ ] `npm run lint` passes without console suppressions
