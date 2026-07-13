import { CatalogRepository, setCatalogRepository } from "./catalogRepository";
import { getDefaultCatalogDbPath } from "./openCatalogDb";
import { openAndMigrateCatalogDb } from "./openAndMigrateCatalogDb";

/**
 * Open the catalog DB under `userDataPath`, apply migrations, and register
 * the process-wide repository. Call once during main-process bootstrap.
 */
export function initCatalog(userDataPath: string): CatalogRepository {
  const dbPath = getDefaultCatalogDbPath(userDataPath);
  const db = openAndMigrateCatalogDb(dbPath);
  const repository = new CatalogRepository(db);
  repository.refresh();
  setCatalogRepository(repository);
  return repository;
}
