import type { CatalogDb } from "../openCatalogDb";

export interface CatalogMigration {
  version: number;
  name: string;
  up: (db: CatalogDb) => void;
}
