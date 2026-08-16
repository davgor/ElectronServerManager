import type Database from "better-sqlite3";

import type { ModManagerMigration } from "./modManagerMigrationTypes";

interface AppliedRow {
  version: number;
}

/**
 * Apply pending mod-manager migrations in order. Fails loudly on error.
 */
export function migrateModManager(
  db: Database.Database,
  migrations: ModManagerMigration[]
): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  const applied = new Set(
    (
      db.prepare(`SELECT version FROM schema_migrations`).all() as AppliedRow[]
    ).map((r) => r.version)
  );

  const insert = db.prepare(
    `INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)`
  );

  const run = db.transaction(() => {
    for (const migration of migrations) {
      if (applied.has(migration.version)) {
        continue;
      }
      migration.up(db);
      insert.run(migration.version, new Date().toISOString());
    }
  });

  run();
}
