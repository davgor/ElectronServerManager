# EPIC: SteamCMD path file picker

The settings SteamCMD path field is a free-text input, so users must type the full executable path. Mirror the existing backup-folder native dialog so picking `steamcmd` / `steamcmd.exe` is one click.

**Related:** epic 006 (`board/done/006-reliable-process-management.md`) — SteamCMD path setting; `select-backup-folder` pattern in `serverBackup.ts`.

## Acceptance criteria (epic)

- [x] Settings exposes a Browse action that opens a native file picker for the SteamCMD executable
- [x] Choosing a file persists `steamCmdPath` the same way as typing + blur
- [x] Text input remains usable (empty = auto-detect; cancel leaves the value unchanged)
- [x] Unit tests cover main-process dialog handler + renderer Browse persistence
- [x] `npm run lint`, `npm test`, `npm run type-check`, `npm run deadcode`, `npm run electron-build` pass

## Sub-tickets

| Id | Title |
|----|-------|
| 032.1 | Native file picker IPC for SteamCMD path |
| 032.2 | Browse button on SteamCMD settings input |

### 032.1 — Native file picker IPC for SteamCMD path

Add `select-steamcmd-path` IPC (typed contract, preload allowlist, main handler) that opens `dialog.showOpenDialog` with `openFile` for the SteamCMD executable, following `selectBackupFolder`.

**Origin:** User request — avoid typing the full steamcmd path.

#### Acceptance criteria

- [x] `selectSteamCmdPath` returns the selected path, or canceled/null without changing settings
- [x] Dialog uses `openFile` (not directory) with a clear title
- [x] Unit tests mock `showOpenDialog` (success, cancel, missing window)
- [x] `npm test` for the new handler passes

### 032.2 — Browse button on SteamCMD settings input

Add a Browse control next to the SteamCMD path field that calls `selectSteamCmdPath` and persists the chosen path via existing settings save.

**Origin:** User request — file picker UX in settings.

#### Acceptance criteria

- [x] Browse button visible next to SteamCMD Path field
- [x] Successful pick updates the field and triggers settings persistence
- [x] Cancel / failed pick leaves the current value alone
- [x] Existing type-and-blur persistence still works
- [x] Renderer/App tests cover Browse → save-settings
