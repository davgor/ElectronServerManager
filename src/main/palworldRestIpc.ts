import type {
  PalworldRestCallResult,
  PalworldRestEndpoint,
  PalworldRestStatusResponse,
} from "../types/ipc";

import { getCatalogRepository } from "./catalog/catalogRepository";
import { ensureDefaultGameRestAdapters } from "./gameRest/ensureDefaultAdapters";
import { getGameRestAdapter } from "./gameRest/registry";
import { getServerConfig } from "./serverConfig";

/**
 * REST status for games with the `rest_admin` catalog capability.
 * `isPalworld` remains for IPC compatibility and means "REST admin capable".
 */
export async function getPalworldRestStatus(
  appId: number,
  installPath: string
): Promise<PalworldRestStatusResponse> {
  ensureDefaultGameRestAdapters();
  const catalog = getCatalogRepository();

  if (!catalog.hasCapability(appId, "rest_admin")) {
    return {
      success: true,
      enabled: false,
      isPalworld: false,
    };
  }

  const metadata = catalog.getRestMetadata(appId);
  if (metadata === null) {
    return {
      success: false,
      enabled: false,
      isPalworld: true,
      error: "REST metadata missing from server catalog",
    };
  }

  const adapter = getGameRestAdapter(metadata.adapterId);
  if (adapter === null) {
    return {
      success: false,
      enabled: false,
      isPalworld: true,
      error: `No REST adapter registered for id "${metadata.adapterId}"`,
    };
  }

  const configResult = await getServerConfig(appId, installPath);
  if (!configResult.success || configResult.content === undefined) {
    return {
      success: false,
      enabled: false,
      isPalworld: true,
      error: configResult.error ?? "Failed to read server config",
    };
  }

  const rest = adapter.extractConfig(configResult.content, metadata);
  return {
    success: true,
    enabled: rest.enabled,
    isPalworld: true,
    port: rest.port,
  };
}

export async function invokePalworldRest(
  appId: number,
  installPath: string,
  method: "GET" | "POST",
  endpoint: PalworldRestEndpoint,
  body?: Record<string, unknown>
): Promise<PalworldRestCallResult> {
  ensureDefaultGameRestAdapters();
  const catalog = getCatalogRepository();

  if (!catalog.hasCapability(appId, "rest_admin")) {
    return {
      success: false,
      error: "REST admin is not available for this server",
    };
  }

  const metadata = catalog.getRestMetadata(appId);
  if (metadata === null) {
    return {
      success: false,
      error: "REST metadata missing from server catalog",
    };
  }

  const adapter = getGameRestAdapter(metadata.adapterId);
  if (adapter === null) {
    return {
      success: false,
      error: `No REST adapter registered for id "${metadata.adapterId}"`,
    };
  }

  const configResult = await getServerConfig(appId, installPath);
  if (!configResult.success || configResult.content === undefined) {
    return {
      success: false,
      error: configResult.error ?? "Failed to read server config",
    };
  }

  const rest = adapter.extractConfig(configResult.content, metadata);
  return adapter.call(rest, { method, endpoint, body });
}
