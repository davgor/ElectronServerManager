import type { ServerRestMetadata } from "../catalog/serverCapabilities";

/** Normalized REST connection settings extracted from a server config file. */
export interface GameRestConfig {
  enabled: boolean;
  port: number;
  adminPassword: string;
}

export type GameRestFetch = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  }
) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
}>;

export interface GameRestCallRequest {
  method: "GET" | "POST";
  /** Adapter-specific path segment (e.g. Palworld `/v1/api/<endpoint>`). */
  endpoint: string;
  body?: Record<string, unknown>;
}

export interface GameRestCallResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

/**
 * Per-game REST protocol adapter. Catalog `server_rest_metadata.adapter_id`
 * selects which adapter handles config extraction and HTTP calls.
 */
export interface GameRestAdapter {
  readonly id: string;
  extractConfig(
    content: Record<string, unknown>,
    metadata: ServerRestMetadata
  ): GameRestConfig;
  call(
    config: GameRestConfig,
    request: GameRestCallRequest,
    fetchImpl?: GameRestFetch
  ): Promise<GameRestCallResult>;
}
