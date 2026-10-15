import fs from "fs";
import path from "path";

import {
  getDefaultModManagerDbPath,
  openAndMigrateModManagerDb,
  type ModManagerDb,
} from "./modManagerDb";
import type { ModManagerPaths } from "./modLifecycle";
import { ModRepository } from "./modRepository";

let db: ModManagerDb | null = null;
let repository: ModRepository | null = null;
let paths: ModManagerPaths | null = null;

/**
 * Open the mod-manager DB under `userDataPath`, apply migrations, and register
 * the process-wide repository + stash root. Call once during main bootstrap.
 */
export function initModManager(userDataPath: string): ModRepository {
  const dbPath = getDefaultModManagerDbPath(userDataPath);
  db = openAndMigrateModManagerDb(dbPath);
  repository = new ModRepository(db);
  const stashRoot = path.join(userDataPath, "mod-stash");
  fs.mkdirSync(stashRoot, { recursive: true });
  paths = { stashRoot };
  return repository;
}

/**
 * Close the mod-manager DB and clear the process-wide repository + stash root.
 * Safe to call when not initialized. Windows cannot delete `userDataPath`
 * while `mod-manager.sqlite` is open, so tests call this before cleanup.
 */
export function closeModManager(): void {
  db?.close();
  db = null;
  repository = null;
  paths = null;
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
