import { migration001ModManagerSchema } from "./migrations/001_schema";
import type { ModManagerMigration } from "./modManagerMigrationTypes";

export const MOD_MANAGER_MIGRATIONS: ModManagerMigration[] = [
  migration001ModManagerSchema,
];
