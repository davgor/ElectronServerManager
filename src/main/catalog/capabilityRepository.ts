import type { CatalogDb } from "./openCatalogDb";
import {
  isServerCapabilityId,
  type ServerCapabilityId,
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

/**
 * Capability + REST metadata reads for the SQLite catalog (epic 039).
 * Kept separate from CatalogRepository so feature gates do not share that
 * module's mutation surface with unrelated ServerInfo mapping code.
 */
export class CapabilityRepository {
  private capabilitiesCache: Map<number, ServerCapabilityId[]> | null = null;
  private restMetadataCache: Map<number, ServerRestMetadata> | null = null;

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

  public hasCapability(appId: number, capability: ServerCapabilityId): boolean {
    return this.listCapabilities(appId).includes(capability);
  }

  public listCapabilities(appId: number): ServerCapabilityId[] {
    return [...(this.ensureCapabilities().get(appId) ?? [])];
  }

  public getRestMetadata(appId: number): ServerRestMetadata | null {
    return this.ensureRestMetadata().get(appId) ?? null;
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
