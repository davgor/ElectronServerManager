# Adding a new dedicated server to the catalog

Steam Server Manager loads its game catalog from a SQLite database
(`server-catalog.sqlite` under Electron `userData`). Schema and seed data are
applied by ordered migrations in `src/main/catalog/migrations/`. Adding support
for a new game is a new numbered migration (plus tests), not an edit to a
TypeScript object literal.

## The catalog schema

Each server row is keyed by Steam **app ID** and maps to the `ServerInfo`
shape used at runtime (`src/main/steamDetection.ts`):

| Column / override        | Required | Maps to `ServerInfo` | Description |
| ------------------------ | -------- | -------------------- | ----------- |
| `app_id`                 | yes      | record key           | Steam dedicated server app ID |
| `name`                   | yes      | `name`               | Display name in the UI |
| `folder_name`            | no       | `folderName`         | Folder under `steamapps/common/` |
| `executable`             | yes      | `executable`         | Default executable (relative to install) |
| `save_location`          | no       | `saveLocation`       | Default save directory (relative) |
| `config_location`        | no       | `configLocation`     | Default config file (relative) |
| platform override row    | no       | `executables` / `saveLocations` / `configLocations` | Per-`win32`/`linux`/`darwin` overrides |

Resolution rules are unchanged: `resolveServerExecutable`,
`resolveServerConfigLocation`, and `resolveServerSaveLocation` prefer the
platform override and fall back to the default column.

## Steps to add a server

1. **Find the dedicated server's Steam app ID.** Search
   [SteamDB](https://steamdb.info/) for "`<game name>` dedicated server". The
   *server* app ID usually differs from the game's app ID.
2. **Find the folder and file names.** Install via Steam or SteamCMD and inspect
   `steamapps/common/<folder>` for `folder_name`, executables, save path, and
   config path (`.json` / `.ini` only for the config editor).
3. **Add a new migration** under `src/main/catalog/migrations/` (next version
   number after the highest existing file). Register it in
   `src/main/catalog/catalogMigrations.ts`. Use the template below.
4. **Add unit tests.** Assert the new rows (and platform overrides) via
   `openAndMigrateCatalogDb(":memory:")` / `CatalogRepository`, and cover
   executable resolution in `platformResolution.test.ts` (or a sibling test).
5. **Verify.** Run `npm run lint`, `npm test`, and `npm run type-check`, then
   launch the app (`npm start`) with the server installed and confirm detection
   and start/stop.

On first launch after upgrade, pending migrations apply automatically when
`initCatalog()` opens the DB.

## Example migration template

```typescript
// src/main/catalog/migrations/003_seed_my_game.ts
import type { CatalogMigration } from "./types";

export const migration003SeedMyGame: CatalogMigration = {
  version: 3,
  name: "seed_my_game",
  up(db) {
    db.prepare(
      `INSERT INTO servers (
         app_id, name, folder_name, executable, save_location, config_location
       ) VALUES (
         @app_id, @name, @folder_name, @executable, @save_location, @config_location
       )`
    ).run({
      app_id: 1234567,
      name: "My Game Dedicated Server",
      folder_name: "MyGameServer",
      executable: "MyGameServer.exe",
      save_location: "MyGame/Saved/SaveGames",
      config_location: "MyGame/Saved/Config/WindowsServer/Settings.ini",
    });

    // Only when another OS uses a different binary or config path:
    db.prepare(
      `INSERT INTO server_platform_overrides (
         app_id, platform, executable, save_location, config_location
       ) VALUES (
         @app_id, @platform, @executable, @save_location, @config_location
       )`
    ).run({
      app_id: 1234567,
      platform: "linux",
      executable: "MyGameServer.sh",
      save_location: null,
      config_location: "MyGame/Saved/Config/LinuxServer/Settings.ini",
    });
  },
};
```

Then append `migration003SeedMyGame` to `CATALOG_MIGRATIONS` in
`src/main/catalog/catalogMigrations.ts`.

Notes:

- Windows-only servers (e.g. Enshrouded) need only the `servers` insert; Linux
  users typically run the same `.exe` through Wine/Proton.
- Do not edit old migrations that already shipped — always add a new version.
- Native module: `better-sqlite3` must match the runtime ABI.
  - Electron / `npm start` / packaging: `npm run rebuild:native` (force rebuild via `@electron/rebuild`; also runs at the start of `npm run dev`)
  - Jest / Node tests: `npm run rebuild:native:node` (also runs via `pretest`)
  - Smoke check: `npm run verify:native:electron`
