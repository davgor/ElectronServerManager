import fs from "fs";
import path from "path";

import {
  getDefaultModManagerDbPath,
  openAndMigrateModManagerDb,
} from "./modManagerDb";
import type { ModManagerPaths } from "./modLifecycle";
import { ModRepository } from "./modRepository";

let repository: ModRepository | null = null;
let paths: ModManagerPaths | null = null;

/**
 * Open the mod-manager DB under `userDataPath`, apply migrations, and register
 * the process-wide repository + stash root. Call once during main bootstrap.
 */
export function initModManager(userDataPath: string): ModRepository {
  const dbPath = getDefaultModManagerDbPath(userDataPath);
  const db = openAndMigrateModManagerDb(dbPath);
  repository = new ModRepository(db);
  const stashRoot = path.join(userDataPath, "mod-stash");
  fs.mkdirSync(stashRoot, { recursive: true });
  paths = { stashRoot };
  return repository;
}

export function getModRepository(): ModRepository {
  if (!repository) {
    throw new Error("Mod manager has not been initialized");
  }
  return repository;
}

export function getModManagerPaths(): ModManagerPaths {
  if (!paths) {
    throw new Error("Mod manager has not been initialized");
  }
  return paths;
}
