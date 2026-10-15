import {
  CatalogRepository,
  resetCatalogRepositoryForTests,
  setCatalogRepository,
} from "../../../main/catalog/catalogRepository";
import {
  CapabilityRepository,
  resetCapabilityRepositoryForTests,
  setCapabilityRepository,
} from "../../../main/catalog/capabilityRepository";
import { openAndMigrateCatalogDb } from "../../../main/catalog/openAndMigrateCatalogDb";
import {
  ensureDefaultGameRestAdapters,
  resetDefaultGameRestAdaptersForTests,
} from "../../../main/gameRest/ensureDefaultAdapters";
import { resetGameRestAdaptersForTests } from "../../../main/gameRest/registry";
// Query adapters register lazily (ensureDefaultGameQueryAdapters) so suites
// can jest.mock the A2S client; only clear the registry here.
import { resetGameQueryAdaptersForTests } from "../../../main/gameQuery/registry";

/** Install a process-wide in-memory catalog for unit tests. */
export function installTestCatalog(): void {
  resetCatalogRepositoryForTests();
  resetCapabilityRepositoryForTests();
  resetGameRestAdaptersForTests();
  resetDefaultGameRestAdaptersForTests();
  resetGameQueryAdaptersForTests();
  const db = openAndMigrateCatalogDb(":memory:");
  const repository = new CatalogRepository(db);
  repository.refresh();
  setCatalogRepository(repository);
  const capabilities = new CapabilityRepository(db);
  capabilities.refresh();
  setCapabilityRepository(capabilities);
  ensureDefaultGameRestAdapters();
}
