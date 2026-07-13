import {
  CatalogRepository,
  resetCatalogRepositoryForTests,
  setCatalogRepository,
} from "../../../main/catalog/catalogRepository";
import { openAndMigrateCatalogDb } from "../../../main/catalog/openAndMigrateCatalogDb";

/** Install a process-wide in-memory catalog for unit tests. */
export function installTestCatalog(): void {
  resetCatalogRepositoryForTests();
  const db = openAndMigrateCatalogDb(":memory:");
  const repository = new CatalogRepository(db);
  repository.refresh();
  setCatalogRepository(repository);
}
