import {
  CatalogRepository,
  resetCatalogRepositoryForTests,
  setCatalogRepository,
} from "../../../main/catalog/catalogRepository";
import { openAndMigrateCatalogDb } from "../../../main/catalog/openAndMigrateCatalogDb";
import {
  ensureDefaultGameRestAdapters,
  resetDefaultGameRestAdaptersForTests,
} from "../../../main/gameRest/ensureDefaultAdapters";
import { resetGameRestAdaptersForTests } from "../../../main/gameRest/registry";

/** Install a process-wide in-memory catalog for unit tests. */
export function installTestCatalog(): void {
  resetCatalogRepositoryForTests();
  resetGameRestAdaptersForTests();
  resetDefaultGameRestAdaptersForTests();
  const db = openAndMigrateCatalogDb(":memory:");
  const repository = new CatalogRepository(db);
  repository.refresh();
  setCatalogRepository(repository);
  ensureDefaultGameRestAdapters();
}
