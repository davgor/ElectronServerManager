# EPIC: Finish SQLite static data + easy multi-game porting

Finish moving app-owned static/game capability data into SQLite (beyond the catalog seed from epic **029**), then make adding a new game as easy as porting Palworld’s capabilities — with README/`docs/ADDING_SERVERS.md` as the single runbook and any refactors those docs require. Implement **039.1 before 039.2** (user order: items 4 → 5).

## Research notes

### Item 4 — Static data still hardcoded after 029

Epic **029** moved `STEAM_DEDICATED_SERVERS` into SQLite (`servers` + `server_platform_overrides`) with migrations. Explicitly **out of scope** then: capability flags and Palworld REST/live-ops coupling. Remaining static / game-specific knowledge still in TypeScript:

| Location | What | Why it should move / stay |
|----------|------|---------------------------|
| `src/types/ipc.ts` `PALWORLD_APP_ID` | Hardcoded 1623730 | Gates Admin / live ops / announce-before-update |
| `ServerCard.tsx` `isPalworld` | `appId === PALWORLD_APP_ID` | UI capability check |
| `palworldRestIpc.ts` / `palworldRest.ts` | App-id gate + default REST port 8212 | Protocol defaults + enablement |
| `autoUpdate.ts` | Palworld-only REST announce path | Should be capability-driven (“warn via REST before update”) |
| Catalog schema | No `capabilities` / `rest` / `ops` tables | 029 deferred this |
| Cover art URL pattern | Generic Steam CDN helper | Fine to keep as code (not game data) |

**Goal:** catalog (or related SQLite tables) owns which games support REST admin, live ops, update-announce, default REST port/auth config keys, etc. Runtime code keys off capabilities from the DB, not a single Palworld constant.

Settings in `electron-store` (per-server toggles, paths) stay as user data — not “static.”

### Item 5 — Easy to port Palworld capabilities to a new game

`docs/ADDING_SERVERS.md` already covers migration-based catalog rows. It does **not** explain how to get Palworld-class features (REST admin modal, live ops panel, announce-before-reboot) on a new title. Those features are named and branched on Palworld.

Gaps to close:

1. **Capability model** in SQLite (e.g. `rest_admin`, `live_ops`, `update_announce`) + optional REST metadata (default port, config keys for enable/port/password).
2. **Refactor** UI/main so Admin / ops / announce read capabilities from catalog IPC instead of `PALWORLD_APP_ID`.
3. **Protocol adapters** — keep Palworld REST implementation as the first adapter; document how a second game plugs in (even if only Palworld ships an adapter initially).
4. **README** — short “Adding a new game” section that points at the full runbook and lists the capability checklist (detect → run/stop → config → backup → optional REST/ops/announce).
5. **Golden path test** — adding a fictional third game via migration + capability flags is covered by tests (may stub REST).

## Acceptance criteria (epic)

- [x] Game capability / REST static defaults live in SQLite migrations; production UI/main does not special-case Palworld solely via a hardcoded app id constant
- [x] README + `docs/ADDING_SERVERS.md` describe an end-to-end add-game path including optional Palworld-parity capabilities
- [x] Refactors make wiring a new game’s detect/run/config/backup (and optional REST/ops) a migration + thin adapter + tests, not scattered `if (appId === …)` edits
- [x] Existing Palworld + Enshrouded behavior unchanged; verification gate passes

## Sub-tickets

| Id | Title | Maps to |
|----|-------|---------|
| 039.1 | Move remaining static/capability data into SQLite | Item 4 |
| 039.2 | README add-game runbook + portability refactors | Item 5 |

### 039.1 — Move remaining static/capability data into SQLite

Extend the catalog schema with versioned migrations for capabilities and any REST-related static defaults still hardcoded for Palworld. Seed Palworld (and Enshrouded as capability-empty) accordingly. Replace `PALWORLD_APP_ID` checks in main/renderer with repository queries (e.g. `hasCapability(appId, "rest_admin")`).

Keep protocol implementation modules (HTTP shapes for Palworld REST) in code; only **whether** and **default config binding** come from SQLite.

#### Acceptance criteria

- [x] New migration(s) add capability (and needed REST metadata) storage; Palworld seeded with current behavior flags/defaults
- [x] `PALWORLD_APP_ID` is no longer the production gate for Admin / live ops / update announce (constant may remain only in tests or as seed data)
- [x] Unit tests cover capability reads and Enshrouded-negative / Palworld-positive cases
- [x] `ARCHITECTURE.md` catalog section documents the new tables
- [x] Verification gate passes

### 039.2 — README add-game runbook + portability refactors

Rewrite the operator/dev docs so adding a game is obvious from the README, and refactor any remaining Palworld-only structure that blocks a second REST-capable game.

**Docs:**

- README: concise “Adding a new game” section → link `docs/ADDING_SERVERS.md`
- `ADDING_SERVERS.md`: checklist for catalog row, platform overrides, capabilities, optional REST adapter hook, tests, manual smoke

**Code refactors (only as needed for the runbook to be true):**

- Generic “REST admin / live ops” UI entry points driven by capabilities
- Clear adapter interface for game REST (Palworld implements it)
- Auto-update announce path keyed by capability, not app id
- Optional: example migration template for a third game with capabilities commented

#### Acceptance criteria

- [x] README links and summarizes add-game steps; full detail in `docs/ADDING_SERVERS.md`
- [x] A contributor can follow the doc to add catalog + capability rows without editing Palworld-named conditionals in `ServerCard` / `autoUpdate`
- [x] Palworld Admin + live ops + announce still work; Enshrouded unchanged
- [x] Tests demonstrate capability-driven enablement (fixture game or mocked capability)
- [x] Verification gate passes; DOCUMENTATION_INDEX updated if needed
