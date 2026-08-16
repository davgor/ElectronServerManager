# Adding a new dedicated server to the catalog

Steam Server Manager loads its game catalog from a SQLite database
(`server-catalog.sqlite` under Electron `userData`). Schema and seed data are
applied by ordered migrations in `src/main/catalog/migrations/`. Adding support
for a new game is a new numbered migration (plus tests), not an edit to a
TypeScript object literal or scattered `if (appId === …)` checks.

## Capability checklist

| Step | What to ship | Where |
|------|--------------|--------|
| 1. Detect | Catalog row + platform overrides | Migration → `servers` / `server_platform_overrides` |
| 2. Run / stop | Executable (+ optional platform override) | Same migration |
| 3. Config editor | `config_location` (`.json` / `.ini`) | Same migration |
| 4. Backup | `save_location` | Same migration |
| 5. Optional REST admin | `rest_admin` + `server_rest_metadata` + adapter | Migration + `src/main/gameRest/` |
| 6. Optional live ops | `live_ops` (usually with `rest_admin`) | Migration capability row |
| 7. Optional update announce | `update_announce` (REST announce before SteamCMD reboot) | Migration capability row |
| 8. Tests | Repository + resolution (+ adapter if REST) | `src/__tests__/main/catalog/`, etc. |
| 9. Manual smoke | Detect → start/stop → config → backup → Admin/ops if enabled | `npm start` with the server installed |

UI entry points (`ServerCard` Admin / live ops, auto-update announce) read
`SteamServer.capabilities` from the catalog via detection IPC. Do **not** add
new Palworld-named conditionals in the renderer or `autoUpdate.ts`.

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

### Capabilities + REST metadata

| Table | Columns | Notes |
|-------|---------|-------|
| `server_capabilities` | `app_id`, `capability` | `capability` ∈ `rest_admin` \| `live_ops` \| `update_announce` |
| `server_rest_metadata` | `app_id`, `adapter_id`, `default_port`, `enabled_config_key`, `port_config_key`, `password_config_key` | Required when seeding `rest_admin` |

Resolution rules are unchanged: `resolveServerExecutable`,
`resolveServerConfigLocation`, and `resolveServerSaveLocation` prefer the
platform override and fall back to the default column.

`CatalogRepository.hasCapability(appId, …)` / `getRestMetadata(appId)` are the
main-process APIs. Detected servers include a `capabilities` array for the UI.

## Steps to add a server

1. **Find the dedicated server's Steam app ID.** Search
   [SteamDB](https://steamdb.info/) for "`<game name>` dedicated server". The
   *server* app ID usually differs from the game's app ID.
2. **Find the folder and file names.** Install via Steam or SteamCMD and inspect
   `steamapps/common/<folder>` for `folder_name`, executables, save path, and
   config path (`.json` / `.ini` only for the config editor).
3. **Add a new migration** under `src/main/catalog/migrations/` (next version
   number after the highest existing file). Register it in
   `src/main/catalog/catalogMigrations.ts`. Use the templates below.
4. **Optional REST / ops / announce.** Insert capability rows and REST metadata.
   If the game’s HTTP protocol is not Palworld’s, add a new adapter under
   `src/main/gameRest/adapters/`, register it in
   `ensureDefaultGameRestAdapters()`, and set `adapter_id` accordingly.
5. **Add unit tests.** Assert the new rows (and platform overrides / capabilities)
   via `openAndMigrateCatalogDb(":memory:")` / `CatalogRepository`, and cover
   executable resolution in `platformResolution.test.ts` (or a sibling test).
6. **Verify.** Run `npm run lint`, `npm test`, and `npm run type-check`, then
   launch the app (`npm start`) with the server installed and confirm detection
   and start/stop (plus Admin/ops if you seeded those capabilities).

On first launch after upgrade, pending migrations apply automatically when
`initCatalog()` opens the DB.

## Example migration template (detect / run / config / backup)

```typescript
// src/main/catalog/migrations/00N_seed_my_game.ts
import type { CatalogMigration } from "./types";

export const migration00NSeedMyGame: CatalogMigration = {
  version: N, // next unused version
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

## Optional: Palworld-parity capabilities (commented template)

Uncomment and adjust when the new game should show Admin / live ops / announce.
Reuse `adapter_id: "palworld"` only if the HTTP API matches Palworld’s
`/v1/api/*` Basic Auth shape; otherwise implement a new adapter.

```typescript
// Inside the same migration `up(db)` after inserting the servers row:
/*
for (const capability of ["rest_admin", "live_ops", "update_announce"] as const) {
  db.prepare(
    `INSERT INTO server_capabilities (app_id, capability)
     VALUES (@app_id, @capability)`
  ).run({ app_id: 1234567, capability });
}

db.prepare(
  `INSERT INTO server_rest_metadata (
     app_id, adapter_id, default_port,
     enabled_config_key, port_config_key, password_config_key
   ) VALUES (
     @app_id, @adapter_id, @default_port,
     @enabled_config_key, @port_config_key, @password_config_key
   )`
).run({
  app_id: 1234567,
  adapter_id: "palworld", // or your new adapter id
  default_port: 8212,
  enabled_config_key: "RESTAPIEnabled",
  port_config_key: "RESTAPIPort",
  password_config_key: "AdminPassword",
});
*/
```

Then append the migration export to `CATALOG_MIGRATIONS` in
`src/main/catalog/catalogMigrations.ts`.

## REST adapter hook

1. Implement `GameRestAdapter` (`src/main/gameRest/types.ts`) with a unique
   `id`, `extractConfig` (using catalog metadata keys), and `call`.
2. Register it from `ensureDefaultGameRestAdapters()` in
   `src/main/gameRest/ensureDefaultAdapters.ts`.
3. Point `server_rest_metadata.adapter_id` at that id.

Protocol modules (URL paths, auth headers) stay in code; SQLite only decides
**whether** REST is offered and which config keys / default port bind it.

Notes:

- Windows-only servers (e.g. Enshrouded) need only the `servers` insert; Linux
  users typically run the same `.exe` through Wine/Proton.
- Do not edit old migrations that already shipped — always add a new version.
- Native module: `better-sqlite3` must match the runtime ABI.
  - Electron / `npm start` / packaging: `npm run rebuild:native` (force rebuild via `@electron/rebuild`; also runs at the start of `npm run dev`)
  - Jest / Node tests: `npm run rebuild:native:node` (also runs via `pretest`)
  - Smoke check: `npm run verify:native:electron`
