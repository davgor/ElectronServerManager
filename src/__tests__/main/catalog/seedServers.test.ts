import { CATALOG_MIGRATIONS } from "../../../main/catalog/catalogMigrations";
import { migrateCatalogDb } from "../../../main/catalog/migrate";
import { openAndMigrateCatalogDb } from "../../../main/catalog/openAndMigrateCatalogDb";

const ENSHROUDED_APP_ID = 2278520;
const PALWORLD_APP_ID = 1623730;

describe("seed Enshrouded + Palworld migrations", () => {
  it("inserts golden catalog rows matching the historical TypeScript catalog", () => {
    const db = openAndMigrateCatalogDb(":memory:");
    try {
      const servers = db
        .prepare(
          `SELECT app_id, name, folder_name, executable, save_location, config_location
           FROM servers
           ORDER BY app_id`
        )
        .all() as Array<{
        app_id: number;
        name: string;
        folder_name: string | null;
        executable: string;
        save_location: string | null;
        config_location: string | null;
      }>;

      expect(servers).toEqual([
        {
          app_id: PALWORLD_APP_ID,
          name: "Palworld Dedicated Server",
          folder_name: "PalServer",
          executable: "PalServer.exe",
          save_location: "Pal/Saved/SaveGames",
          config_location:
            "Pal/Saved/Config/WindowsServer/PalWorldSettings.ini",
        },
        {
          app_id: ENSHROUDED_APP_ID,
          name: "Enshrouded Dedicated Server",
          folder_name: "EnshroudedServer",
          executable: "enshrouded_server.exe",
          save_location: "savegame",
          config_location: "enshrouded_server.json",
        },
      ]);

      const overrides = db
        .prepare(
          `SELECT app_id, platform, executable, save_location, config_location
           FROM server_platform_overrides
           ORDER BY app_id, platform`
        )
        .all() as Array<{
        app_id: number;
        platform: string;
        executable: string | null;
        save_location: string | null;
        config_location: string | null;
      }>;

      expect(overrides).toEqual([
        {
          app_id: PALWORLD_APP_ID,
          platform: "linux",
          executable: "PalServer.sh",
          save_location: null,
          config_location: "Pal/Saved/Config/LinuxServer/PalWorldSettings.ini",
        },
      ]);
    } finally {
      db.close();
    }
  });

  it("skips seed migration when already applied", () => {
    const db = openAndMigrateCatalogDb(":memory:");
    try {
      migrateCatalogDb(db, CATALOG_MIGRATIONS);
      const count = (
        db.prepare("SELECT COUNT(*) AS c FROM servers").get() as { c: number }
      ).c;
      expect(count).toBe(2);
    } finally {
      db.close();
    }
  });
});
