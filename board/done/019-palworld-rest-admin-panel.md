# EPIC: Palworld REST admin panel

Add a Palworld-only Admin control on the server card that opens a modal exposing every documented Palworld REST API endpoint. When `RESTAPIEnabled` is not true in config, the button is disabled with a tooltip directing the user to enable REST API via Edit Config. Shared main-process REST client and typed IPC land here for epic 020 to reuse.

Official API: https://docs.palworldgame.com/category/rest-api/

## Acceptance criteria (epic)

- [x] Palworld card shows Admin control; other games do not
- [x] Button disabled + tooltip when `RESTAPIEnabled` is not true
- [x] Modal exposes every documented REST endpoint
- [x] Auth/port come from server config; calls stay in main process
- [x] Unit tests for client + IPC; lint/type-check/test/electron-build pass

## Sub-tickets

| Id | Title |
|----|-------|
| 019.1 | REST client + config detection |
| 019.2 | Typed IPC for all endpoints |
| 019.3 | Admin button + disabled tooltip |
| 019.4 | Admin modal UI |

### 019.1 — REST client + config detection

Read `RESTAPIEnabled`, `RESTAPIPort`, and `AdminPassword` from Palworld `PalWorldSettings.ini` (OptionSettings map). Implement an HTTP Basic Auth client against `http://127.0.0.1:{port}/v1/api`. Unit tests with mocked HTTP + fixture INI.

#### Acceptance criteria

- [x] `extractPalworldRestConfig` (or equivalent) reports enabled/disabled, port, and password from parsed INI content
- [x] Client performs Basic Auth (`admin` + AdminPassword) against localhost REST base URL
- [x] Unit tests cover enabled/disabled detection and successful/failed HTTP calls
- [x] `npm test` targeted suite for the new module passes

### 019.2 — Typed IPC for all endpoints

Wire typed IPC for: `info`, `players`, `settings`, `metrics`, `announce`, `kick`, `ban`, `unban`, `save`, `shutdown`, `stop`, and world actor snapshot (`game-data`). Keep renderer free of Node networking.

#### Acceptance criteria

- [x] `IpcInvokeMap`, `ElectronAPI`, preload `ALLOWED_CHANNELS`, and `registerIpcHandlers` cover Palworld REST channels
- [x] Capability/status channel reports whether REST is enabled in config (without requiring the server to be up)
- [x] All documented endpoints are invokable via typed preload API
- [x] Preload/handler pairing tests and IPC contract tests pass

### 019.3 — Admin button + disabled tooltip

On Palworld `ServerCard` (appId 1623730): Admin button opens the modal when REST is enabled in config; otherwise disabled with tooltip text: "Please enable REST API from the config settings."

#### Acceptance criteria

- [x] Admin button only rendered for Palworld (appId 1623730)
- [x] Button disabled with the specified tooltip when REST API is not enabled in config
- [x] Button opens admin modal when enabled

### 019.4 — Admin modal UI

Modal sections: read (info/players/settings/metrics/snapshot), player actions (kick/ban/unban + reason), server control (announce/save/shutdown with waittime/message, force stop). Show success/error from IPC. Confirm destructive actions (ban/stop/shutdown).

#### Acceptance criteria

- [x] Modal exposes every documented REST endpoint via UI controls
- [x] Destructive actions require confirmation
- [x] IPC success and error results are visible in the modal
- [x] Renderer components stay on typed `window.electron` only
