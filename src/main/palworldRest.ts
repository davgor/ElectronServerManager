/**
 * Palworld dedicated-server REST API client (localhost Basic Auth).
 * Docs: https://docs.palworldgame.com/category/rest-api/
 *
 * Enablement / default port / config keys for a given app come from the
 * SQLite catalog (`server_capabilities` + `server_rest_metadata`). This
 * module only implements the Palworld HTTP protocol.
 */

import type { PalworldRestEndpoint } from "../types/ipc";

const DEFAULT_PALWORLD_REST_PORT = 8212;

export interface PalworldRestConfig {
  enabled: boolean;
  port: number;
  adminPassword: string;
}

interface PalworldRestCallResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

interface PalworldRestRequest {
  method: "GET" | "POST";
  endpoint: PalworldRestEndpoint;
  body?: Record<string, unknown>;
}

export type PalworldRestFetch = (
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

/** Optional catalog REST metadata — keys/port come from SQLite when provided. */
export interface PalworldRestConfigBinding {
  defaultPort: number;
  enabledConfigKey: string;
  portConfigKey: string;
  passwordConfigKey: string;
}

const DEFAULT_CONFIG_BINDING: PalworldRestConfigBinding = {
  defaultPort: DEFAULT_PALWORLD_REST_PORT,
  enabledConfigKey: "RESTAPIEnabled",
  portConfigKey: "RESTAPIPort",
  passwordConfigKey: "AdminPassword",
};

function stripQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

/** Walk nested config objects for OptionSettings-style REST keys. */
function findOptionSettings(
  root: Record<string, unknown>
): Record<string, unknown> | null {
  const direct = asRecord(root.OptionSettings);
  if (direct !== null) {
    return direct;
  }
  for (const value of Object.values(root)) {
    const section = asRecord(value);
    if (section === null) {
      continue;
    }
    const nested = asRecord(section.OptionSettings);
    if (nested !== null) {
      return nested;
    }
  }
  return null;
}

function readStringField(
  map: Record<string, unknown>,
  key: string
): string | undefined {
  const raw = map[key];
  if (typeof raw === "string") {
    return stripQuotes(raw);
  }
  if (typeof raw === "number" || typeof raw === "boolean") {
    return String(raw);
  }
  return undefined;
}

function parseEnabled(raw: string | undefined): boolean {
  if (raw === undefined) {
    return false;
  }
  return raw.trim().toLowerCase() === "true";
}

function parsePort(raw: string | undefined, defaultPort: number): number {
  if (raw === undefined || raw.trim() === "") {
    return defaultPort;
  }
  const port = Number(raw);
  if (!Number.isFinite(port) || port <= 0 || port > 65535) {
    return defaultPort;
  }
  return Math.trunc(port);
}

export function extractPalworldRestConfig(
  content: Record<string, unknown>,
  binding: PalworldRestConfigBinding = DEFAULT_CONFIG_BINDING
): PalworldRestConfig {
  const options = findOptionSettings(content);
  if (options === null) {
    return {
      enabled: false,
      port: binding.defaultPort,
      adminPassword: "",
    };
  }

  return {
    enabled: parseEnabled(readStringField(options, binding.enabledConfigKey)),
    port: parsePort(
      readStringField(options, binding.portConfigKey),
      binding.defaultPort
    ),
    adminPassword: readStringField(options, binding.passwordConfigKey) ?? "",
  };
}

export function buildPalworldRestUrl(
  port: number,
  endpoint: PalworldRestEndpoint
): string {
  return `http://127.0.0.1:${port}/v1/api/${endpoint}`;
}

export function buildPalworldRestAuthHeader(adminPassword: string): string {
  const token = Buffer.from(`admin:${adminPassword}`, "utf8").toString(
    "base64"
  );
  return `Basic ${token}`;
}

export async function callPalworldRest(
  config: PalworldRestConfig,
  request: PalworldRestRequest,
  fetchImpl: PalworldRestFetch = globalThis.fetch as PalworldRestFetch
): Promise<PalworldRestCallResult> {
  if (!config.enabled) {
    return {
      success: false,
      error: "Palworld REST API is not enabled in server config",
    };
  }

  const url = buildPalworldRestUrl(config.port, request.endpoint);
  const headers: Record<string, string> = {
    Authorization: buildPalworldRestAuthHeader(config.adminPassword),
  };

  let body: string | undefined;
  if (request.method === "POST" && request.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(request.body);
  }

  try {
    const response = await fetchImpl(url, {
      method: request.method,
      headers,
      body,
    });

    if (!response.ok) {
      let detail = "";
      try {
        detail = await response.text();
      } catch {
        detail = "";
      }
      const suffix = detail.trim() !== "" ? `: ${detail.trim()}` : "";
      return {
        success: false,
        error: `Palworld REST HTTP ${String(response.status)}${suffix}`,
      };
    }

    try {
      const data: unknown = await response.json();
      return { success: true, data };
    } catch {
      return { success: true, data: {} };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
