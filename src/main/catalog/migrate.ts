import type { CatalogDb } from "./openCatalogDb";
import type { CatalogMigration } from "./migrations/types";

const ENSURE_MIGRATIONS_TABLE = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY NOT NULL,
  applied_at TEXT NOT NULL
);
`;

function getAppliedVersions(db: CatalogDb): Set<number> {
  const rows = db
    .prepare("SELECT version FROM schema_migrations")
    .all() as Array<{ version: number }>;
  return new Set(rows.map((row) => row.version));
}

/**
 * Apply pending catalog migrations in version order.
 * Each migration runs in a transaction; failures are not recorded as applied.
 */
export function migrateCatalogDb(
  db: CatalogDb,
  migrations: CatalogMigration[]
): void {
  db.exec(ENSURE_MIGRATIONS_TABLE);

  const applied = getAppliedVersions(db);
  const ordered = [...migrations].sort((a, b) => a.version - b.version);

  for (const migration of ordered) {
    if (applied.has(migration.version)) {
      continue;
    }

    const apply = db.transaction(() => {
      migration.up(db);
      db.prepare(
        "INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)"
      ).run(migration.version, new Date().toISOString());
    });

    try {
      apply();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Catalog migration ${migration.version} (${migration.name}) failed: ${message}`
      );
    }
  }
}
