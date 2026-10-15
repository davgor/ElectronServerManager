import type { ServerOpsProtocol } from "../../types/ipc";

import type { CatalogDb } from "./openCatalogDb";
import {
  isServerCapabilityId,
  type ServerCapabilityId,
  type ServerQueryMetadata,
  type ServerRestMetadata,
} from "./serverCapabilities";

type CapabilityRow = {
  app_id: number;
  capability: string;
};

type RestMetadataRow = {
  app_id: number;
  adapter_id: string;
  default_port: number;
  enabled_config_key: string;
  port_config_key: string;
  password_config_key: string;
};

type QueryMetadataRow = {
  app_id: number;
  adapter_id: string;
  default_port: number;
  port_config_key: string;
  host_config_key: string | null;
  admin_config_key: string | null;
};

/**
 * Capability + REST/query metadata reads for the SQLite catalog (epics 039,
 * 042).
 * Kept separate from CatalogRepository so feature gates do not share that
 * module's mutation surface with unrelated ServerInfo mapping code.
 */
export class CapabilityRepository {
  private capabilitiesCache: Map<number, ServerCapabilityId[]> | null = null;
  private restMetadataCache: Map<number, ServerRestMetadata> | null = null;
  private queryMetadataCache: Map<number, ServerQueryMetadata> | null = null;

  public constructor(private readonly db: CatalogDb) {}

  public refresh(): void {
    const capabilityRows = this.db
      .prepare(
        `SELECT app_id, capability
         FROM server_capabilities
         ORDER BY app_id, capability`
      )
      .all() as CapabilityRow[];

    const capabilities = new Map<number, ServerCapabilityId[]>();
    for (const row of capabilityRows) {
      if (!isServerCapabilityId(row.capability)) {
        continue;
      }
      const list = capabilities.get(row.app_id) ?? [];
      list.push(row.capability);
      capabilities.set(row.app_id, list);
    }
    this.capabilitiesCache = capabilities;

    const metadataRows = this.db
      .prepare(
        `SELECT app_id, adapter_id, default_port,
                enabled_config_key, port_config_key, password_config_key
         FROM server_rest_metadata`
      )
      .all() as RestMetadataRow[];

    const metadata = new Map<number, ServerRestMetadata>();
    for (const row of metadataRows) {
      metadata.set(row.app_id, {
        adapterId: row.adapter_id,
        defaultPort: row.default_port,
        enabledConfigKey: row.enabled_config_key,
        portConfigKey: row.port_config_key,
        passwordConfigKey: row.password_config_key,
      });
    }
    this.restMetadataCache = metadata;

    const queryRows = this.db
      .prepare(
        `SELECT app_id, adapter_id, default_port,
                port_config_key, host_config_key, admin_config_key
         FROM server_query_metadata`
      )
      .all() as QueryMetadataRow[];

    const queryMetadata = new Map<number, ServerQueryMetadata>();
    for (const row of queryRows) {
      queryMetadata.set(row.app_id, {
        adapterId: row.adapter_id,
        defaultPort: row.default_port,
        portConfigKey: row.port_config_key,
        hostConfigKey: row.host_config_key,
        adminConfigKey: row.admin_config_key,
      });
    }
    this.queryMetadataCache = queryMetadata;
  }

  private ensureCapabilities(): Map<number, ServerCapabilityId[]> {
    if (this.capabilitiesCache === null) {
      this.refresh();
    }
    return this.capabilitiesCache as Map<number, ServerCapabilityId[]>;
  }

  private ensureRestMetadata(): Map<number, ServerRestMetadata> {
    if (this.restMetadataCache === null) {
      this.refresh();
    }
    return this.restMetadataCache as Map<number, ServerRestMetadata>;
  }

  private ensureQueryMetadata(): Map<number, ServerQueryMetadata> {
    if (this.queryMetadataCache === null) {
      this.refresh();
    }
    return this.queryMetadataCache as Map<number, ServerQueryMetadata>;
  }

  public hasCapability(appId: number, capability: ServerCapabilityId): boolean {
    return this.listCapabilities(appId).includes(capability);
  }

  public listCapabilities(appId: number): ServerCapabilityId[] {
    return [...(this.ensureCapabilities().get(appId) ?? [])];
  }

  public getRestMetadata(appId: number): ServerRestMetadata | null {
    return this.ensureRestMetadata().get(appId) ?? null;
  }

  public getQueryMetadata(appId: number): ServerQueryMetadata | null {
    return this.ensureQueryMetadata().get(appId) ?? null;
  }

  /**
   * Which ops protocol backs this app's capabilities: REST metadata wins
   * (Palworld), then query metadata (Enshrouded), else null.
   */
  public getOpsProtocol(appId: number): ServerOpsProtocol | null {
    if (this.getRestMetadata(appId) !== null) {
      return "rest";
    }
    if (this.getQueryMetadata(appId) !== null) {
      return "query";
    }
    return null;
  }
}

let activeCapabilityRepository: CapabilityRepository | null = null;

export function setCapabilityRepository(
  repository: CapabilityRepository
): void {
  activeCapabilityRepository = repository;
}

export function getCapabilityRepository(): CapabilityRepository {
  if (activeCapabilityRepository === null) {
    throw new Error(
      "Capability repository is not initialized. Call initCatalog() during app bootstrap."
    );
  }
  return activeCapabilityRepository;
}

export function resetCapabilityRepositoryForTests(): void {
  activeCapabilityRepository = null;
}
