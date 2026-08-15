import { CatalogRepository } from "../../../main/catalog/catalogRepository";
import { openAndMigrateCatalogDb } from "../../../main/catalog/openAndMigrateCatalogDb";
import { migrateCatalogDb } from "../../../main/catalog/migrate";
import { openCatalogDb } from "../../../main/catalog/openCatalogDb";
import { CATALOG_MIGRATIONS } from "../../../main/catalog/catalogMigrations";
import type { CatalogMigration } from "../../../main/catalog/migrations/types";

const ENSHROUDED_APP_ID = 2278520;
const PALWORLD_APP_ID = 1623730;
const FICTIONAL_APP_ID = 9000001;

describe("catalog capabilities (039.1)", () => {
  it("seeds Palworld with REST/ops/announce capabilities and REST metadata", () => {
    const db = openAndMigrateCatalogDb(":memory:");
    try {
      const repo = new CatalogRepository(db);

      expect(repo.hasCapability(PALWORLD_APP_ID, "rest_admin")).toBe(true);
      expect(repo.hasCapability(PALWORLD_APP_ID, "live_ops")).toBe(true);
      expect(repo.hasCapability(PALWORLD_APP_ID, "update_announce")).toBe(true);
      expect(repo.listCapabilities(PALWORLD_APP_ID)).toEqual([
        "live_ops",
        "rest_admin",
        "update_announce",
      ]);

      expect(repo.getRestMetadata(PALWORLD_APP_ID)).toEqual({
        adapterId: "palworld",
        defaultPort: 8212,
        enabledConfigKey: "RESTAPIEnabled",
        portConfigKey: "RESTAPIPort",
        passwordConfigKey: "AdminPassword",
      });
    } finally {
      db.close();
    }
  });

  it("treats Enshrouded as capability-empty with no REST metadata", () => {
    const db = openAndMigrateCatalogDb(":memory:");
    try {
      const repo = new CatalogRepository(db);

      expect(repo.hasCapability(ENSHROUDED_APP_ID, "rest_admin")).toBe(false);
      expect(repo.hasCapability(ENSHROUDED_APP_ID, "live_ops")).toBe(false);
      expect(repo.hasCapability(ENSHROUDED_APP_ID, "update_announce")).toBe(
        false
      );
      expect(repo.listCapabilities(ENSHROUDED_APP_ID)).toEqual([]);
      expect(repo.getRestMetadata(ENSHROUDED_APP_ID)).toBeNull();
    } finally {
      db.close();
    }
  });

  it("returns false/empty/null for unknown app ids", () => {
    const db = openAndMigrateCatalogDb(":memory:");
    try {
      const repo = new CatalogRepository(db);
      expect(repo.hasCapability(9999999, "rest_admin")).toBe(false);
      expect(repo.listCapabilities(9999999)).toEqual([]);
      expect(repo.getRestMetadata(9999999)).toBeNull();
    } finally {
      db.close();
    }
  });
});

describe("golden path: fictional third game via migration + capabilities (039.2)", () => {
  const seedFictionalGame: CatalogMigration = {
    version: 4,
    name: "seed_fictional_rest_game",
    up(db) {
      db.prepare(
        `INSERT INTO servers (
           app_id, name, folder_name, executable, save_location, config_location
         ) VALUES (
           @app_id, @name, @folder_name, @executable, @save_location, @config_location
         )`
      ).run({
        app_id: FICTIONAL_APP_ID,
        name: "Fictional Dedicated Server",
        folder_name: "FictionalServer",
        executable: "FictionalServer.exe",
        save_location: "Saves",
        config_location: "config.ini",
      });

      for (const capability of [
        "rest_admin",
        "live_ops",
        "update_announce",
      ] as const) {
        db.prepare(
          `INSERT INTO server_capabilities (app_id, capability)
           VALUES (@app_id, @capability)`
        ).run({ app_id: FICTIONAL_APP_ID, capability });
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
        app_id: FICTIONAL_APP_ID,
        adapter_id: "palworld",
        default_port: 9000,
        enabled_config_key: "RestEnabled",
        port_config_key: "RestPort",
        password_config_key: "RestPassword",
      });
    },
  };

  it("enables capability reads for a third game without editing app-id conditionals", () => {
    const db = openCatalogDb(":memory:");
    try {
      migrateCatalogDb(db, [...CATALOG_MIGRATIONS, seedFictionalGame]);
      const repo = new CatalogRepository(db);

      expect(repo.getServer(FICTIONAL_APP_ID)?.name).toBe(
        "Fictional Dedicated Server"
      );
      expect(repo.hasCapability(FICTIONAL_APP_ID, "rest_admin")).toBe(true);
      expect(repo.hasCapability(FICTIONAL_APP_ID, "live_ops")).toBe(true);
      expect(repo.hasCapability(FICTIONAL_APP_ID, "update_announce")).toBe(
        true
      );
      expect(repo.getRestMetadata(FICTIONAL_APP_ID)).toEqual({
        adapterId: "palworld",
        defaultPort: 9000,
        enabledConfigKey: "RestEnabled",
        portConfigKey: "RestPort",
        passwordConfigKey: "RestPassword",
      });

      // Existing games unchanged
      expect(repo.hasCapability(PALWORLD_APP_ID, "rest_admin")).toBe(true);
      expect(repo.hasCapability(ENSHROUDED_APP_ID, "rest_admin")).toBe(false);
    } finally {
      db.close();
    }
  });
});
