# EPIC: Bring Enshrouded ops up to Palworld parity

Upgrade Enshrouded (`2278520`) so operators get the same **class of** Admin / live-ops / pre-update player-awareness UX that Palworld already ships (epics **019**, **020**, **036**), using Enshrouded’s real surfaces instead of inventing a fake REST API. Epic **039** already made Admin / ops / announce capability-driven and documented the second-game adapter path — this epic is the first real second-game consumer of that design.

**Related done work:** **019** Palworld REST admin, **020** Palworld live ops, **036** announce-before-reboot, **038** host metrics (already shared), **039** SQLite capabilities + `gameRest` registry.

**Out of scope:** third-party hosting control-plane APIs; inventing in-game chat injection; Palworld behavior changes except shared renames/generalizations required for a second adapter.

## Research notes

### What Palworld has today

| Capability | Mechanism | UI |
|------------|-----------|-----|
| `rest_admin` | HTTP Basic Auth → `http://127.0.0.1:{RESTAPIPort}/v1/api/*` | Admin modal (info/players/settings/metrics/snapshot, kick/ban/unban, announce/save/shutdown/stop) |
| `live_ops` | Polls GET info/players/metrics | On-card ops panel + persisted interval |
| `update_announce` | REST `announce` + warn window before SteamCMD stop | Silent path in `autoUpdate.ts` when capability present |

Catalog seeds those three capabilities + `server_rest_metadata` (`adapter_id: "palworld"`). Enshrouded is still **capability-empty**.

### What Enshrouded actually exposes

There is **no** official Enshrouded REST admin or RCON protocol comparable to Palworld’s documented API. Admin kick/ban/unban happen via **in-game chat** after joining with a `userGroups` password from `enshrouded_server.json`. Remote “announce / save / shutdown via HTTP” does not exist in the stock dedicated server.

What *is* available and widely used by community tools:

1. **Valve A2S server query** on `queryPort` (default **15637**, from `enshrouded_server.json`) — server name, map/version labels, player count, and often player names/scores (same family of queries used by server browsers and ops sidecars).
2. **Config-driven roles** — `userGroups[]` with `password`, `canKickBan`, build/inventory flags, `reservedSlots`.
3. **Process + config + backup + CPU/RAM** — already shared with Palworld via the catalog (detect / run / stop / edit JSON / backup / metrics).

### Parity definition (honest mapping)

“In line with Palworld” means **equivalent operator jobs**, not identical HTTP endpoints:

| Operator job | Palworld | Enshrouded target |
|--------------|----------|-------------------|
| See live server health + who is online | REST GET info/players/metrics | A2S info + players on `queryPort` (live ops panel) |
| One-click admin surface | Full REST modal | Admin modal: live query refresh, clear gaps for unsupported remote kick/ban/announce/save; deep-link / focus **Edit Config → userGroups**; reuse existing Stop for process control |
| Warn / protect players before auto-update reboot | REST announce + delay | Player-aware gate: if A2S reports players online, warn/delay (or skip auto-stop) before SteamCMD — same *intent* as `update_announce`, no fake chat message |
| Capability model | SQLite + adapter | Seed Enshrouded capabilities + `adapter_id` (e.g. `enshrouded` / `a2s`) via new migration; do **not** reintroduce `if (appId === …)` in `ServerCard` / `autoUpdate` |

### Capability naming decision (required in 042.2)

Today’s capability ids are REST-shaped: `rest_admin`, `live_ops`, `update_announce`. Enshrouded Admin is **not** REST, and the pre-update gate **cannot** announce.

**Default plan (pick one in 042.2 and stick to it):**

1. **Preferred:** broaden semantics in docs + code comments so:
   - `rest_admin` means “show Admin surface” (protocol comes from `adapter_id`, which may be A2S/query)
   - `live_ops` means “show live ops poller” (same)
   - `update_announce` means “run pre-update player protection” (announce when the adapter supports it; otherwise delay/defer only)
2. **Alternative:** add new capability ids (e.g. `query_admin`, `update_player_gate`) via migration `CHECK` expansion — only if reusing the three ids above would force fake REST metadata or misleading UI copy.

Do **not** seed Enshrouded with `rest_admin` while leaving the Admin modal hard-wired to Palworld HTTP endpoints.

### Architecture implications

- Today `GameRestAdapter` + IPC channels are still named around Palworld REST. Prefer **generalizing** the ops protocol seam (shared status/call IPC or a sibling query adapter registry) so Enshrouded plugs in cleanly; keep Palworld’s HTTP module as the first adapter.
- Renderer still mounts `PalworldAdminModal` / `PalworldOpsPanel` when capabilities are present. Either rename to game-agnostic shells fed by adapter capability descriptors, or keep thin game-specific panels behind the same capability gates — pick the smaller diff that avoids Palworld-only copy on an Enshrouded card.
- `server_rest_metadata` columns (`enabled_config_key`, `port_config_key`, …) assume HTTP enable/port/password. Enshrouded A2S is usually always-on when the process is listening; bind **`queryPort`** (and optionally game name) from JSON. Extend metadata / add a query-metadata table only if the existing columns cannot express that without lying (e.g. fake `enabled_config_key`). Document the choice in `ADDING_SERVERS.md`.
- Host CPU/RAM from epic **038** already applies to Enshrouded — do not rebuild metrics; live ops here is **game-query** data, not process stats.

## Acceptance criteria (epic)

- [ ] Enshrouded card can show a **live ops** panel (toggle + persisted interval) that polls A2S-derived info/players while the server is running
- [ ] Enshrouded card exposes an **Admin** entry point with the read/query actions that are actually possible, honest empty/disabled states for unsupported remote moderation/announce/save, and a clear path into `userGroups` config
- [ ] Auto-update path for Enshrouded is **player-aware** when the new update capability is seeded (warn and/or delay while A2S shows players; never claim an in-game announce was sent)
- [ ] Catalog migration seeds Enshrouded capabilities + adapter metadata; production gates stay capability/adapter-driven (no new hardcoded Enshrouded-only branches in `ServerCard` / `autoUpdate` beyond adapter registration)
- [ ] README supported-servers table + `docs/ADDING_SERVERS.md` describe the Enshrouded path; unit tests cover A2S client, adapter, IPC gating, and settings; verification gate passes

## Sub-tickets

| Id | Title | Maps to |
|----|-------|---------|
| 042.1 | Enshrouded A2S/query client + config binding | Research § A2S |
| 042.2 | Catalog capabilities + adapter registration | Architecture |
| 042.3 | Live ops panel parity | Palworld 020 |
| 042.4 | Admin surface parity (honest feature set) | Palworld 019 |
| 042.5 | Player-aware pre-update gate | Palworld 036 / `update_announce` |
| 042.6 | Docs + README supported-servers update | Epic AC |

### 042.1 — Enshrouded A2S/query client + config binding

Implement a main-process query client for Enshrouded’s `queryPort` (default 15637) that returns normalized **info** and **players** shapes suitable for ops UI (and later update gating). Read port (and any needed fields) from parsed `enshrouded_server.json`. Unit-test with injected UDP/socket fakes or recorded datagrams — no live server required in CI.

#### Acceptance criteria

- [ ] `extractEnshroudedQueryConfig` (or equivalent) reports query host/port from config JSON with safe defaults
- [ ] Client can fetch server info + player list against localhost query port
- [ ] Failures return structured errors (timeout, empty, parse) without throwing across IPC
- [ ] Targeted unit tests pass with mocked transport

### 042.2 — Catalog capabilities + adapter registration

Add a versioned catalog migration that seeds Enshrouded with the capabilities this epic will honor (`live_ops` plus Admin + pre-update protection per the **Capability naming decision** above). Register an Enshrouded adapter in `gameRest` (or a generalized ops registry if 042.1 proves REST naming is wrong). Wire status/invoke through typed IPC without requiring the Palworld HTTP client. Record the chosen id scheme in the migration comment and `ADDING_SERVERS.md`.

#### Acceptance criteria

- [ ] Capability id scheme chosen (reuse vs new ids) and documented; Enshrouded seeds match that scheme
- [ ] Fresh DB after migrations: Enshrouded has the intended capability rows + adapter metadata; Palworld rows unchanged
- [ ] Adapter resolves by `adapter_id` from catalog; Enshrouded invoke never calls `palworldRestAdapter`
- [ ] Capability / IPC gating tests cover Enshrouded-positive and still treat unknown apps as empty
- [ ] `ARCHITECTURE.md` catalog table updated for Enshrouded capabilities

### 042.3 — Live ops panel parity

Match epic **020** UX for Enshrouded: toggle, clamped persisted interval, poll only when server running + ops enabled + query available. Reuse or generalize the existing ops panel so the card is not Palworld-branded when `appId` is Enshrouded.

#### Acceptance criteria

- [ ] Ops toggle + interval persist per Enshrouded server (settings store)
- [ ] Panel shows polled info/players (and whatever stable “metrics-like” fields A2S provides); pauses when gated off
- [ ] No polling when server stopped or toggle off
- [ ] Tests for interval clamping + poll gating; verification pieces for this ticket pass

### 042.4 — Admin surface parity (honest feature set)

Ship an Admin control for Enshrouded analogous to Palworld’s button/modal:

- **Include:** refresh info/players; link or guidance to Edit Config for `userGroups` / passwords; destructive **Stop** only via existing confirmed stop flow if shown here
- **Do not fake:** remote kick/ban/unban, announce, save, or REST shutdown — show disabled controls or an explicit “not supported by Enshrouded dedicated server” note so parity is truthful

Generalize naming/copy so the modal is not titled “Palworld REST Admin” on Enshrouded.

#### Acceptance criteria

- [ ] Admin control appears for Enshrouded when the Admin capability is seeded
- [ ] Modal exposes supported query actions and documents unsupported remote moderation/announce/save
- [ ] Destructive process stop (if present) requires confirmation and uses existing stop IPC
- [ ] Renderer stays on typed `window.electron` only; component tests or logic tests cover gating/copy

### 042.5 — Player-aware pre-update gate

When Enshrouded has the update-protection capability, `autoUpdate` must not silently reboot a populated server. Prefer: query A2S player count → if players > 0, apply the same warn-window delay pattern as Palworld (without calling announce) and/or fail closed with a clear stage/error when configured to defer. Exact policy (delay vs abort) should match product choice in implementation but must be tested.

#### Acceptance criteria

- [ ] With players online, auto-update does not stop the process without the chosen warn/defer behavior
- [ ] With zero players (or query failure policy documented), update proceeds; query failures do not look like a successful in-game announce
- [ ] Unit tests cover players > 0, players = 0, and query-error paths
- [ ] Palworld announce path remains intact

### 042.6 — Docs + README supported-servers update

Update operator-facing docs so Enshrouded’s optional features are visible next to Palworld’s.

#### Acceptance criteria

- [ ] README features + supported-servers table list Enshrouded live ops / Admin / player-aware update (with the honesty note on no REST kick/announce)
- [ ] `docs/ADDING_SERVERS.md` mentions A2S/query adapters as a second pattern beside Palworld HTTP
- [ ] `DOCUMENTATION_INDEX.md` touched only if a new doc file is added
- [ ] Markdown-only verification: links resolve to real paths in-repo
