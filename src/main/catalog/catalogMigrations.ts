import { migration001Schema } from "./migrations/001_schema";
import { migration002SeedServers } from "./migrations/002_seed_enshrouded_palworld";
import type { CatalogMigration } from "./migrations/types";

/** Ordered catalog migrations applied on DB open. */
export const CATALOG_MIGRATIONS: CatalogMigration[] = [
  migration001Schema,
  migration002SeedServers,
];
