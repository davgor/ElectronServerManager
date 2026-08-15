import type { CatalogMigration } from "./types";

const PALWORLD_APP_ID = 1623730;

/**
 * Capability flags + REST static defaults (epic 039.1).
 * Palworld is seeded with rest_admin / live_ops / update_announce and REST
 * config key bindings; Enshrouded remains capability-empty.
 */
export const migration003CapabilitiesAndRestMetadata: CatalogMigration = {
  version: 3,
  name: "capabilities_and_rest_metadata",
  up(db) {
    db.exec(`
      CREATE TABLE server_capabilities (
        app_id INTEGER NOT NULL,
        capability TEXT NOT NULL CHECK (
          capability IN ('rest_admin', 'live_ops', 'update_announce')
        ),
        PRIMARY KEY (app_id, capability),
        FOREIGN KEY (app_id) REFERENCES servers(app_id) ON DELETE CASCADE
      );

      CREATE TABLE server_rest_metadata (
        app_id INTEGER PRIMARY KEY NOT NULL,
        adapter_id TEXT NOT NULL,
        default_port INTEGER NOT NULL,
        enabled_config_key TEXT NOT NULL,
        port_config_key TEXT NOT NULL,
        password_config_key TEXT NOT NULL,
        FOREIGN KEY (app_id) REFERENCES servers(app_id) ON DELETE CASCADE
      );
    `);

    const insertCapability = db.prepare(`
      INSERT INTO server_capabilities (app_id, capability)
      VALUES (@app_id, @capability)
    `);

    for (const capability of [
      "rest_admin",
      "live_ops",
      "update_announce",
    ] as const) {
      insertCapability.run({ app_id: PALWORLD_APP_ID, capability });
    }

    db.prepare(
      `
      INSERT INTO server_rest_metadata (
        app_id, adapter_id, default_port,
        enabled_config_key, port_config_key, password_config_key
      ) VALUES (
        @app_id, @adapter_id, @default_port,
        @enabled_config_key, @port_config_key, @password_config_key
      )
    `
    ).run({
      app_id: PALWORLD_APP_ID,
      adapter_id: "palworld",
      default_port: 8212,
      enabled_config_key: "RESTAPIEnabled",
      port_config_key: "RESTAPIPort",
      password_config_key: "AdminPassword",
    });
  },
};
