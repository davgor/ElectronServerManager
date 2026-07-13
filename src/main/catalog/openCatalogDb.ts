import path from "path";

import Database from "better-sqlite3";

/**
 * Catalog schema (applied by migrations, documented here for ServerInfo parity).
 *
 * `servers` holds identity + default paths (maps to ServerInfo defaults).
 * `server_platform_overrides` holds per-platform executable / save / config
 * paths (maps to ServerInfo.executables / saveLocations / configLocations).
 */
export const CATALOG_SCHEMA_DOC = {
  servers: {
    columns: [
      "app_id",
      "name",
      "folder_name",
      "executable",
      "save_location",
      "config_location",
    ] as const,
  },
  server_platform_overrides: {
    columns: [
      "app_id",
      "platform",
      "executable",
      "save_location",
      "config_location",
    ] as const,
    platforms: ["win32", "linux", "darwin"] as const,
  },
  schema_migrations: {
    columns: ["version", "applied_at"] as const,
  },
} as const;

export type CatalogDb = Database.Database;

/**
 * Open (or create) the server catalog SQLite database.
 * Pass `:memory:` or a temp file path in tests to avoid touching the real catalog.
 */
export function openCatalogDb(dbPath: string): CatalogDb {
  const db = new Database(dbPath);
  db.pragma("foreign_keys = ON");
  return db;
}

/** Deterministic catalog DB path under Electron `app.getPath('userData')`. */
export function getDefaultCatalogDbPath(userDataPath: string): string {
  return path.join(userDataPath, "server-catalog.sqlite");
}
