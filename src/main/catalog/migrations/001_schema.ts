import type { CatalogMigration } from "./types";

/** Create servers + platform override tables (ServerInfo-equivalent columns). */
export const migration001Schema: CatalogMigration = {
  version: 1,
  name: "create_catalog_schema",
  up(db) {
    db.exec(`
      CREATE TABLE servers (
        app_id INTEGER PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        folder_name TEXT,
        executable TEXT NOT NULL,
        save_location TEXT,
        config_location TEXT
      );

      CREATE TABLE server_platform_overrides (
        app_id INTEGER NOT NULL,
        platform TEXT NOT NULL CHECK (platform IN ('win32', 'linux', 'darwin')),
        executable TEXT,
        save_location TEXT,
        config_location TEXT,
        PRIMARY KEY (app_id, platform),
        FOREIGN KEY (app_id) REFERENCES servers(app_id) ON DELETE CASCADE
      );
    `);
  },
};
