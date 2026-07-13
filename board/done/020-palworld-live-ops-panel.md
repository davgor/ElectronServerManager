# EPIC: Palworld live ops panel

Add a live “ops” panel on the Palworld server card that polls GET info/players/metrics on a timer. Toggle on/off and persist poll interval per server. Depends on epic 019’s REST client and IPC.

## Acceptance criteria (epic)

- [x] Toggle starts/stops live polling
- [x] Poll interval is configurable and persisted per Palworld server
- [x] Panel updates from GET info/players/metrics only (no destructive actions here)
- [x] No polling when REST disabled, server stopped, or toggle off
- [x] Tests for interval clamping + poll gating; verification gate passes

## Sub-tickets

| Id | Title |
|----|-------|
| 020.1 | Persist ops settings |
| 020.2 | Live panel on card |
| 020.3 | Interval control |

### 020.1 — Persist ops settings

Extend `ServerPersistedSettings` with `palworldOpsEnabled` and `palworldOpsIntervalSeconds` (default 5s; clamp min/max). Wire through settings store and `useServerSettings`.

#### Acceptance criteria

- [x] Settings type includes ops toggle and interval fields
- [x] Interval is clamped to an allowed range (min/max)
- [x] Values persist via existing settings IPC and reload correctly
- [x] Unit tests cover clamping defaults

### 020.2 — Live panel on card

When Palworld + server running + REST enabled + ops toggle on: compact techy panel on the card showing polled info/players/metrics (FPS, player count, uptime, names). Pause polling when toggle off, server stopped, or API disabled.

#### Acceptance criteria

- [x] Panel visible only under the gating conditions above
- [x] Polling uses existing Palworld REST GET IPC (info, players, metrics)
- [x] Polling stops when gated off
- [x] Display updates with latest poll results / errors

### 020.3 — Interval control

UI control on the card to set poll frequency; change takes effect without app restart.

#### Acceptance criteria

- [x] User can change poll interval from the card UI
- [x] New interval is persisted and applied to the active poller without restart
- [x] Control only shown for Palworld when REST is relevant (or alongside ops toggle)
