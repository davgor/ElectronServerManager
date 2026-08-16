import type { ServerInfo } from "../steamDetection";

import type { CatalogDb } from "./openCatalogDb";

type ServerRow = {
  app_id: number;
  name: string;
  folder_name: string | null;
  executable: string;
  save_location: string | null;
  config_location: string | null;
};

type OverrideRow = {
  app_id: number;
  platform: "win32" | "linux" | "darwin";
  executable: string | null;
  save_location: string | null;
  config_location: string | null;
};

function rowToServerInfo(row: ServerRow, overrides: OverrideRow[]): ServerInfo {
  const info: ServerInfo = {
    name: row.name,
    folderName: row.folder_name,
    executable: row.executable,
  };

  if (row.save_location !== null) {
    info.saveLocation = row.save_location;
  }
  if (row.config_location !== null) {
    info.configLocation = row.config_location;
  }

  const executables: Partial<Record<NodeJS.Platform, string>> = {};
  const saveLocations: Partial<Record<NodeJS.Platform, string>> = {};
  const configLocations: Partial<Record<NodeJS.Platform, string>> = {};

  for (const override of overrides) {
    if (override.executable !== null) {
      executables[override.platform] = override.executable;
    }
    if (override.save_location !== null) {
      saveLocations[override.platform] = override.save_location;
    }
    if (override.config_location !== null) {
      configLocations[override.platform] = override.config_location;
    }
  }

  if (Object.keys(executables).length > 0) {
    info.executables = executables;
  }
  if (Object.keys(saveLocations).length > 0) {
    info.saveLocations = saveLocations;
  }
  if (Object.keys(configLocations).length > 0) {
    info.configLocations = configLocations;
  }

  return info;
}

/**
 * Main-process catalog repository. Callers receive ServerInfo shapes; no SQL.
 */
export class CatalogRepository {
  private cache: Map<number, ServerInfo> | null = null;

  public constructor(private readonly db: CatalogDb) {}

  /** Reload rows from SQLite into the in-memory cache. */
  public refresh(): void {
    const serverRows = this.db
      .prepare(
        `SELECT app_id, name, folder_name, executable, save_location, config_location
         FROM servers`
      )
      .all() as ServerRow[];

    const overrideRows = this.db
      .prepare(
        `SELECT app_id, platform, executable, save_location, config_location
         FROM server_platform_overrides`
      )
      .all() as OverrideRow[];

    const overridesByApp = new Map<number, OverrideRow[]>();
    for (const override of overrideRows) {
      const list = overridesByApp.get(override.app_id) ?? [];
      list.push(override);
      overridesByApp.set(override.app_id, list);
    }

    const next = new Map<number, ServerInfo>();
    for (const row of serverRows) {
      next.set(
        row.app_id,
        rowToServerInfo(row, overridesByApp.get(row.app_id) ?? [])
      );
    }
    this.cache = next;
  }

  private ensureCache(): Map<number, ServerInfo> {
    if (this.cache === null) {
      this.refresh();
    }
    return this.cache as Map<number, ServerInfo>;
  }

  public listServers(): Array<{ appId: number; info: ServerInfo }> {
    return [...this.ensureCache().entries()].map(([appId, info]) => ({
      appId,
      info,
    }));
  }

  /** Catalog as Record keyed by app ID (drop-in for STEAM_DEDICATED_SERVERS). */
  public getServersRecord(): Record<number, ServerInfo> {
    return Object.fromEntries(this.ensureCache()) as Record<number, ServerInfo>;
  }

  public getServer(appId: number): ServerInfo | null {
    return this.ensureCache().get(appId) ?? null;
  }
}

let activeRepository: CatalogRepository | null = null;

/** Set the process-wide catalog repository (call after open + migrate). */
export function setCatalogRepository(repository: CatalogRepository): void {
  activeRepository = repository;
}

export function getCatalogRepository(): CatalogRepository {
  if (activeRepository === null) {
    throw new Error(
      "Catalog repository is not initialized. Call initCatalog() during app bootstrap."
    );
  }
  return activeRepository;
}

/** Test helper: clear the process-wide repository singleton. */
export function resetCatalogRepositoryForTests(): void {
  activeRepository = null;
}
