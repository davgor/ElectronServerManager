import { migration001Schema } from "./migrations/001_schema";
import { migration002SeedServers } from "./migrations/002_seed_enshrouded_palworld";
import { migration003CapabilitiesAndRestMetadata } from "./migrations/003_capabilities_and_rest_metadata";
import { migration004EnshroudedQueryCapabilities } from "./migrations/004_enshrouded_query_capabilities";
import { migration005EnshroudedSettingDocs } from "./migrations/005_enshrouded_setting_docs";
import type { CatalogMigration } from "./migrations/types";

/** Ordered catalog migrations applied on DB open. */
export const CATALOG_MIGRATIONS: CatalogMigration[] = [
  migration001Schema,
  migration002SeedServers,
  migration003CapabilitiesAndRestMetadata,
  migration004EnshroudedQueryCapabilities,
  migration005EnshroudedSettingDocs,
];
