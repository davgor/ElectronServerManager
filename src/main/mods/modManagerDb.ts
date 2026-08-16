import path from "path";

import Database from "better-sqlite3";

import { MOD_MANAGER_MIGRATIONS } from "./modManagerMigrations";
import { migrateModManager } from "./migrateModManager";

export type ModManagerDb = Database.Database;

export const MOD_MANAGER_SCHEMA_DOC = {
  mods: {
    columns: [
      "id",
      "app_id",
      "install_path",
      "display_name",
      "package_name",
      "source_zip_name",
      "kind",
      "enabled",
      "workshop_folder",
      "imported_at",
    ] as const,
  },
  mod_file_changes: {
    columns: ["id", "mod_id", "relative_path", "change_type"] as const,
  },
  mod_file_backups: {
    columns: ["change_id", "content"] as const,
  },
} as const;

function openModManagerDb(dbPath: string): ModManagerDb {
  const db = new Database(dbPath);
  db.pragma("foreign_keys = ON");
  return db;
}

export function openAndMigrateModManagerDb(dbPath: string): ModManagerDb {
  const db = openModManagerDb(dbPath);
  migrateModManager(db, MOD_MANAGER_MIGRATIONS);
  return db;
}

export function getDefaultModManagerDbPath(userDataPath: string): string {
  return path.join(userDataPath, "mod-manager.sqlite");
}
