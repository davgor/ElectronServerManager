import type { CatalogMigration } from "./types";

const ENSHROUDED_APP_ID = 2278520;

/**
 * Enshrouded ops parity over Steam A2S (epic 042.2).
 *
 * Capability id scheme: the existing ids are reused with protocol-neutral
 * meaning instead of adding new ids — `rest_admin` = show the Admin surface,
 * `live_ops` = show the live ops poller, `update_announce` = protect players
 * before an auto-update reboot. The protocol comes from which metadata table
 * holds the app: `server_rest_metadata` (HTTP, Palworld) or the new
 * `server_query_metadata` (UDP server query, Enshrouded).
 *
 * Enshrouded has no HTTP admin API, enable flag or admin password, so it gets
 * no `server_rest_metadata` row (that table's NOT NULL enable/password keys
 * would have to be faked). The query listens whenever the server runs, on
 * `queryPort` (default 15637) bound to `ip`; in-game admin roles live in
 * `userGroups`.
 *
 * Downgrade note: app builds before this migration (≤ 1.0.34) opening a v4
 * catalog see Enshrouded's capability rows but no REST metadata, so they show
 * a permanently disabled REST Admin button and update without a player check.
 */
export const migration004EnshroudedQueryCapabilities: CatalogMigration = {
  version: 4,
  name: "enshrouded_query_capabilities",
  up(db) {
    db.exec(`
      CREATE TABLE server_query_metadata (
        app_id INTEGER PRIMARY KEY NOT NULL,
        adapter_id TEXT NOT NULL,
        default_port INTEGER NOT NULL,
        port_config_key TEXT NOT NULL,
        host_config_key TEXT,
        admin_config_key TEXT,
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
      insertCapability.run({ app_id: ENSHROUDED_APP_ID, capability });
    }

    db.prepare(
      `
      INSERT INTO server_query_metadata (
        app_id, adapter_id, default_port,
        port_config_key, host_config_key, admin_config_key
      ) VALUES (
        @app_id, @adapter_id, @default_port,
        @port_config_key, @host_config_key, @admin_config_key
      )
    `
    ).run({
      app_id: ENSHROUDED_APP_ID,
      adapter_id: "a2s",
      default_port: 15637,
      port_config_key: "queryPort",
      host_config_key: "ip",
      admin_config_key: "userGroups",
    });
  },
};
