# EPIC: SQLite server catalog (replace hardcoded game details)

Replace the hardcoded `STEAM_DEDICATED_SERVERS` catalog in `src/main/steamDetection.ts` with a SQLite-backed catalog. Adding support for a new dedicated server should be a versioned SQL migration (plus tests/docs), not an edit to a TypeScript object literal.

Today the catalog is a `Record<number, ServerInfo>` consumed by detection (`findInstalledServers`), process start/stop (`serverProcess`), config I/O (`serverConfig`), and backups (`backupServerSave`). Platform overrides live as nested maps (`executables` / `saveLocations` / `configLocations`). See `docs/ADDING_SERVERS.md` and `ARCHITECTURE.md` § Server catalog.

**Out of scope for this epic:** user-facing UI to add/edit games at runtime; moving Palworld REST/live-ops capability flags into the DB (keep `PALWORLD_APP_ID` as-is unless a cheap `capabilities` table falls out of the schema work).

**Preferred stack:** `better-sqlite3` in the main process (sync, common Electron pattern). Catalog DB is app-owned (bundled or created under `userData` and migrated on startup)—not a substitute for `electron-store` settings.

## Acceptance criteria (epic)

- [x] `STEAM_DEDICATED_SERVERS` object literal is removed; catalog is loaded from SQLite
- [x] Enshrouded (`2278520`) and Palworld (`1623730`) behave identically for detect / run-stop / config / backup
- [x] Adding a new game is documented and demonstrated as "new migration + tests"
- [x] Migrations run automatically on app startup (and in tests via an in-memory or temp DB)
- [x] Unit tests cover schema, migrations, catalog reads, and platform path resolution
- [x] `docs/ADDING_SERVERS.md` + `ARCHITECTURE.md` updated; `npm run lint`, `npm test`, `npm run type-check`, `npm run deadcode`, `npm run electron-build` pass

## Sub-tickets

| Id | Title |
|----|-------|
| 029.1 | Schema + SQLite dependency + DB open |
| 029.2 | Migration runner |
| 029.3 | Seed Enshrouded + Palworld migrations |
| 029.4 | Catalog repository API |
| 029.5 | Wire consumers; delete hardcoded catalog |
| 029.6 | Docs + add-a-game runbook |
| 029.7 | Fix better-sqlite3 Electron ABI on npm run dev |

### 029.1 — Schema + SQLite dependency + DB open

Add `better-sqlite3` (and Electron rebuild / packaging notes as needed). Define the catalog schema that can express everything `ServerInfo` can today: identity (`app_id`, `name`, `folder_name`), default paths (`executable`, `save_location`, `config_location`), and per-platform overrides (`win32` / `linux` / `darwin`).

Open (or create) the DB from main-process bootstrap with a deterministic path for packaged vs dev builds. Prefer a design where tests can open `:memory:` or a temp file without touching the real catalog.

#### Acceptance criteria

- [x] Dependency added; native module rebuilds cleanly for the project's Electron version
- [x] Schema documents columns equivalent to current `ServerInfo` (+ platform overrides)
- [x] `openCatalogDb(path)` (or equivalent) opens/creates the DB; unit test opens an in-memory/temp DB
- [x] `npm test` for the new module passes; `npm run electron-build` still succeeds

### 029.2 — Migration runner

Implement an ordered, versioned migration system (e.g. `migrations/` with numbered SQL or TS migration modules + a `schema_migrations` table). On DB open, apply any pending migrations exactly once, in order. Fail loudly if a migration errors (do not half-apply without a clear error).

#### Acceptance criteria

- [x] Pending migrations apply on open; already-applied migrations are skipped
- [x] Failed migration leaves a clear error (no silent partial success)
- [x] Unit tests cover empty DB, idempotent re-open, and a deliberate failing migration
- [x] Targeted `npm test` suite passes

### 029.3 — Seed Enshrouded + Palworld migrations

First data migration(s) insert the current catalog entries:

| App ID | Name | Notes |
|--------|------|-------|
| `2278520` | Enshrouded Dedicated Server | Windows-oriented defaults only |
| `1623730` | Palworld Dedicated Server | Linux executable + config overrides |

Data must match today's `STEAM_DEDICATED_SERVERS` field-for-field so detection and path resolution stay identical.

#### Acceptance criteria

- [x] Fresh DB after migrations contains both servers with correct defaults and Palworld platform overrides
- [x] Unit test asserts row contents against the known catalog (golden values)
- [x] No remaining need to keep the TypeScript object for production runtime (may still exist until 029.5)

### 029.4 — Catalog repository API

Provide a small main-process API that replaces direct `STEAM_DEDICATED_SERVERS` access, e.g.:

- `listServers()` / `getServer(appId)` → `ServerInfo`-compatible shapes
- Keep or reimplement `resolveServerExecutable`, `resolveServerConfigLocation`, `resolveServerSaveLocation` against repository data

Callers should not speak SQL. Cache-in-memory after load is fine if refresh-on-migration is clear.

#### Acceptance criteria

- [x] Repository returns `ServerInfo`-compatible data for both seeded games
- [x] Platform resolution helpers work from DB-backed data (same behavior as today)
- [x] Unit tests cover missing app ID, defaults, and platform overrides
- [x] Targeted `npm test` suite passes

### 029.5 — Wire consumers; delete hardcoded catalog

Swap all production consumers to the repository:

- `steamDetection.ts` (`findInstalledServers`, backup path helpers)
- `serverProcess.ts` (`getServerMapping`)
- `serverConfig.ts`

Remove `STEAM_DEDICATED_SERVERS`. Update tests that imported the constant to use the repository / seeded test DB. Ensure app bootstrap opens + migrates the catalog before IPC that needs it.

#### Acceptance criteria

- [x] No production references to `STEAM_DEDICATED_SERVERS`
- [x] Existing detection / process / config / backup tests updated and green
- [x] Manual smoke (or equivalent automated coverage): installed Enshrouded + Palworld still list and resolve paths
- [x] `npm test`, `npm run lint`, `npm run type-check`, `npm run electron-build` pass

### 029.6 — Docs + add-a-game runbook

Rewrite `docs/ADDING_SERVERS.md` so the workflow is: find Steam app ID / paths → add a new numbered migration inserting the server (+ overrides) → add resolution/detection tests → verify. Update `ARCHITECTURE.md` server catalog section to describe SQLite + migrations instead of the TypeScript map.

Include a minimal migration template in the doc (mirroring today's TypeScript template).

#### Acceptance criteria

- [x] `docs/ADDING_SERVERS.md` describes migration-based adds end-to-end
- [x] `ARCHITECTURE.md` server catalog section matches the new design
- [x] Template migration in the doc is copy-pasteable for a third game
- [x] Doc-only paths still satisfy markdown-only release skip if applicable

### 029.7 — Fix better-sqlite3 Electron ABI on npm run dev

`npm run dev` crashed in the main process because `better-sqlite3` was loaded with the Node ABI (MODULE_VERSION 137) while Electron 39 expects MODULE_VERSION 140. `npm i` at the start of `dev` rebuilt for Node, and `electron-builder install-app-deps` was not a reliable force rebuild against the app Electron.

#### Acceptance criteria

- [x] `npm run dev` starts without a better-sqlite3 NODE_MODULE_VERSION error
- [x] `rebuild:native` force-rebuilds `better-sqlite3` against the app's installed Electron (`electron-rebuild -f -w better-sqlite3`)
- [x] `dev` does not run `npm i` (which resets the native module to the Node ABI)
- [x] `npm test` still works (Node rebuild via `pretest`)
