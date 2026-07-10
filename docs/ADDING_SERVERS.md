# Adding a new dedicated server to the catalog

Steam Server Manager only detects and manages servers listed in the
`STEAM_DEDICATED_SERVERS` catalog in `src/main/steamDetection.ts`. Adding
support for a new game is a matter of adding one well-formed entry to that
catalog and verifying it.

## The catalog schema

Each entry is keyed by the server's **Steam app ID** and must satisfy the
`ServerInfo` interface (defined in `src/main/steamDetection.ts`):

| Field             | Required | Description                                                                                                     |
| ----------------- | -------- | --------------------------------------------------------------------------------------------------------------- |
| `name`            | yes      | Display name shown in the UI.                                                                                     |
| `folderName`      | no       | Folder name under `steamapps/common/` (used when the install folder isn't the numeric app ID).                    |
| `executable`      | yes      | Default server executable, relative to the install path. Used when no per-platform override matches.              |
| `executables`     | no       | Per-platform executable overrides, keyed by `process.platform` (`win32`, `linux`, `darwin`).                      |
| `saveLocation`    | no       | Default save-data directory, relative to the install path (used by backups).                                      |
| `saveLocations`   | no       | Per-platform save location overrides.                                                                             |
| `configLocation`  | no       | Default config file, relative to the install path (used by the config editor).                                    |
| `configLocations` | no       | Per-platform config file overrides.                                                                                |

Resolution rules: at runtime the app resolves the executable, config, and save
paths for the current OS via `resolveServerExecutable`,
`resolveServerConfigLocation`, and `resolveServerSaveLocation`. Each checks the
per-platform map first (`executables[platform]`, etc.) and falls back to the
default field (`executable`, etc.) when no override exists. Omit the
per-platform maps entirely when every OS uses the same paths.

## Steps to add a server

1. **Find the dedicated server's Steam app ID.** Search
   [SteamDB](https://steamdb.info/) for "`<game name>` dedicated server". Note:
   the *server* app ID usually differs from the game's app ID.
2. **Find the folder and file names.** Install the server via Steam or SteamCMD
   and inspect `steamapps/common/<folder>`:
   - the install folder name (`folderName`),
   - the server executable(s) per OS (`executable` / `executables`),
   - where it writes saves (`saveLocation` / `saveLocations`),
   - where its config file lives (`configLocation` / `configLocations`).
     Only `.json` and `.ini` configs are supported by the config editor.
3. **Add the entry** to `STEAM_DEDICATED_SERVERS` in
   `src/main/steamDetection.ts` (template below).
4. **Add unit tests.** At minimum, cover executable resolution for the
   platforms the server supports (see
   `src/__tests__/main/platformResolution.test.ts` for examples).
5. **Verify.** Run `npm run lint`, `npm test`, and `npm run type-check`, then
   launch the app (`npm start`) with the server installed and confirm it is
   detected and can be started/stopped.

## Example entry template

```typescript
export const STEAM_DEDICATED_SERVERS: Record<number, ServerInfo> = {
  // ... existing entries ...
  1234567: {
    name: "My Game Dedicated Server",
    folderName: "MyGameServer",
    // Default (Windows) executable
    executable: "MyGameServer.exe",
    // Only needed when another OS uses a different binary
    executables: {
      linux: "MyGameServer.sh",
    },
    saveLocation: "MyGame/Saved/SaveGames",
    configLocation: "MyGame/Saved/Config/WindowsServer/Settings.ini",
    // Only needed when another OS uses a different config path
    configLocations: {
      linux: "MyGame/Saved/Config/LinuxServer/Settings.ini",
    },
  },
};
```

Notes:

- Windows-only servers (no native Linux/macOS build, e.g. Enshrouded) should
  define only the default fields; users on Linux typically run the same `.exe`
  through Wine/Proton.
- Paths are always relative to the server's install directory and use forward
  slashes; they are joined with `path.join` at runtime.
