import type { CatalogMigration } from "./types";

/**
 * Seed Enshrouded + Palworld to match historical STEAM_DEDICATED_SERVERS values.
 */
export const migration002SeedServers: CatalogMigration = {
  version: 2,
  name: "seed_enshrouded_palworld",
  up(db) {
    const insertServer = db.prepare(`
      INSERT INTO servers (
        app_id, name, folder_name, executable, save_location, config_location
      ) VALUES (
        @app_id, @name, @folder_name, @executable, @save_location, @config_location
      )
    `);

    const insertOverride = db.prepare(`
      INSERT INTO server_platform_overrides (
        app_id, platform, executable, save_location, config_location
      ) VALUES (
        @app_id, @platform, @executable, @save_location, @config_location
      )
    `);

    insertServer.run({
      app_id: 2278520,
      name: "Enshrouded Dedicated Server",
      folder_name: "EnshroudedServer",
      executable: "enshrouded_server.exe",
      save_location: "savegame",
      config_location: "enshrouded_server.json",
    });

    insertServer.run({
      app_id: 1623730,
      name: "Palworld Dedicated Server",
      folder_name: "PalServer",
      executable: "PalServer.exe",
      save_location: "Pal/Saved/SaveGames",
      config_location: "Pal/Saved/Config/WindowsServer/PalWorldSettings.ini",
    });

    insertOverride.run({
      app_id: 1623730,
      platform: "linux",
      executable: "PalServer.sh",
      save_location: null,
      config_location: "Pal/Saved/Config/LinuxServer/PalWorldSettings.ini",
    });
  },
};
