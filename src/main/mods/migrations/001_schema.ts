import type { ModManagerMigration } from "../modManagerMigrationTypes";

export const migration001ModManagerSchema: ModManagerMigration = {
  version: 1,
  name: "create_mod_manager_schema",
  up(db) {
    db.exec(`
      CREATE TABLE mods (
        id TEXT PRIMARY KEY NOT NULL,
        app_id INTEGER NOT NULL,
        install_path TEXT NOT NULL,
        display_name TEXT NOT NULL,
        package_name TEXT,
        source_zip_name TEXT,
        kind TEXT NOT NULL CHECK (kind IN ('workshop', 'path_deploy')),
        enabled INTEGER NOT NULL DEFAULT 1,
        workshop_folder TEXT,
        imported_at TEXT NOT NULL
      );

      CREATE TABLE mod_file_changes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        mod_id TEXT NOT NULL,
        relative_path TEXT NOT NULL,
        change_type TEXT NOT NULL CHECK (
          change_type IN ('created', 'overwritten', 'settings')
        ),
        FOREIGN KEY (mod_id) REFERENCES mods(id) ON DELETE CASCADE
      );

      CREATE TABLE mod_file_backups (
        change_id INTEGER PRIMARY KEY NOT NULL,
        content BLOB NOT NULL,
        FOREIGN KEY (change_id) REFERENCES mod_file_changes(id) ON DELETE CASCADE
      );

      CREATE INDEX idx_mods_server ON mods(app_id, install_path);
      CREATE INDEX idx_mod_file_changes_mod ON mod_file_changes(mod_id);
    `);
  },
};
