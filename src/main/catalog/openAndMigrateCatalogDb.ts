import { CATALOG_MIGRATIONS } from "./catalogMigrations";
import { migrateCatalogDb } from "./migrate";
import { openCatalogDb } from "./openCatalogDb";
import type { CatalogDb } from "./openCatalogDb";

/**
 * Open the catalog DB and apply all pending migrations.
 * Prefer this over `openCatalogDb` alone for app bootstrap and integration tests.
 */
export function openAndMigrateCatalogDb(dbPath: string): CatalogDb {
  const db = openCatalogDb(dbPath);
  migrateCatalogDb(db, CATALOG_MIGRATIONS);
  return db;
}
