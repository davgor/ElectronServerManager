# 036 — Warn players before auto-update reboot (Palworld REST)

When Steam auto-update finds a newer build and the Palworld REST API is enabled (`RESTAPIEnabled`), players should get an in-game announce before downtime: warn that an update is available and the server will reboot in 5 minutes, wait that window, then stop → SteamCMD update → restart.

If REST is disabled (or the server is not Palworld), keep the immediate stop → update → restart path from ticket 035.

**Related:** `035-non-disruptive-steam-update-check`, `019` Palworld REST, `src/main/autoUpdate.ts`, `src/main/palworldRestIpc.ts`.

## Acceptance criteria

- [x] When an update is available and Palworld REST is enabled, auto-update POSTs `/announce` with a clear 5-minute reboot warning before stopping the server
- [x] After a successful announce, wait 5 minutes (injectable in tests), then run the existing stop → `app_update` → restart flow
- [x] When REST is disabled / not Palworld, skip announce and delay; update immediately as today
- [x] Announce failure leaves the server running and returns `stage: "notifying"` with a clear error (no surprise reboot without the warning)
- [x] Concurrent auto-update for the same appId is coalesced (in-flight guard) so the 5-minute wait cannot overlap a second stop/update
- [x] Unit tests cover announce+delay, skip-when-disabled, announce-failure, and in-flight skip; verification gate passes; `ARCHITECTURE.md` notes the warn window
