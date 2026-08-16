# Game (server) auto-updates via SteamCMD — operator notes

How the per-server **Auto-update & restart when available** flow works, what
"success" means, and the cases that still need manual operator action.

## What the app does (epic 038.1)

When auto-update is enabled for a running server, the app polls on a cooldown
and runs this state machine (`src/main/autoUpdate.ts`):

1. **checking** — read the local buildid from the app manifest and compare it
   to the remote public-branch buildid (`steamcmd +app_info_print`, no
   download). Matching buildids leave the server running (`no-update`).
2. **notifying** — Palworld with `RESTAPIEnabled`: announce a 5-minute reboot
   warning and wait before any downtime.
3. **stopping → updating** — stop the managed process, then run
   `steamcmd +force_install_dir <installPath> +login anonymous
   +app_update <appId> validate +quit`.
4. **verifying** — re-read the manifest (with backoff) and require it to match
   the **remote** buildid. A SteamCMD exit code of 0/7 alone is *not* treated
   as success; a partial download reports `success: false` at the `verifying`
   stage instead of a silent "99.9% done" state.
5. **restarting** — the server is always restarted after a successful stop,
   whether or not the update completed. Failures to restart are surfaced in
   the UI error banner.

### Which manifest is read

The buildid is resolved from the first of these that exists
(`buildManifestCandidatePaths` in `src/main/steamDetection.ts`):

1. `<installPath>/steamapps/appmanifest_<appId>.acf` — written by SteamCMD
   itself when using `+force_install_dir` (authoritative after the first
   SteamCMD-run update).
2. `<library>/steamapps/appmanifest_<appId>.acf` — the Steam library that owns
   the install (`installPath` is `<library>/steamapps/common/<folder>`), which
   covers multi-library setups.
3. `<steamRoot>/steamapps/appmanifest_<appId>.acf` — the selected Steam root.

## Cases that still need the operator

### The Steam client shows the update stuck at ~99.9% / "finish" pending

SteamCMD updates the install directory and writes its own manifest **inside
the install** (`<installPath>/steamapps/`), but it does not update the Steam
client's own library manifest or download state. If the same app is also
visible in your Steam client library, Steam may still believe an update is
pending even though the server files are current and the server restarted.

- The server itself is fine — the app verified the install against the remote
  buildid before reporting success.
- To clear Steam's stale state: close the Steam client and reopen it (it
  rescans manifests), or let Steam "finish" its own download once while the
  server is stopped. Do **not** run Steam's download and SteamCMD at the same
  time against the same install.
- Recommended: manage dedicated servers from a Steam library folder that the
  Steam client does not actively update (or exclusively via this app), so the
  two never fight over the same depot files.

### Apps whose server depot requires a Steam login

The update runs `+login anonymous`. Most dedicated servers (including
Enshrouded `2278520` and Palworld `1623730`) allow anonymous downloads, but
some titles require a real Steam account for their server depot. In that case
SteamCMD fails (or syncs nothing) and the app reports the failure with
SteamCMD's output in the error and in the app logs. Run the update manually
with a logged-in SteamCMD:

```bash
steamcmd +force_install_dir <installPath> +login <account> +app_update <appId> validate +quit
```

The app does not store Steam credentials by design.

### Steam client holds file locks

If the Steam client is actively downloading/validating the same app while
SteamCMD writes to the install, files can be locked (especially on Windows)
and the verify step will report an incomplete update. Close Steam (or pause
its download for that app) and let the next auto-update cycle retry.

## Diagnosing failures

- Every failure carries the stage it failed at (`checking`, `updating`,
  `verifying`, `restarting`, …) plus an error message in the UI banner.
- SteamCMD output is captured (the tail, where depot/login errors appear) and
  included in `updating`-stage errors and the main-process log.
- `verifying` failures mean SteamCMD exited "successfully" but the manifest
  buildid never reached the remote buildid — usually anonymous-login depot
  limits, disk space, or Steam client interference (see above).
