import type {
  PalworldRestCallResult,
  PalworldRestEndpoint,
  PalworldRestStatusResponse,
} from "../types/ipc";

import {
  getCapabilityRepository,
  type CapabilityRepository,
} from "./catalog/capabilityRepository";
import { ensureDefaultGameRestAdapters } from "./gameRest/ensureDefaultAdapters";
import { getGameRestAdapter } from "./gameRest/registry";
import { getServerConfig } from "./serverConfig";

/**
 * `rest_admin` means "show the Admin surface" (epic 042); only apps whose
 * Admin is backed by REST (not a UDP server query) take the HTTP path.
 */
function isRestAdminApp(catalog: CapabilityRepository, appId: number): boolean {
  return (
    catalog.hasCapability(appId, "rest_admin") &&
    catalog.getOpsProtocol(appId) !== "query"
  );
}

/**
 * REST status for games with REST-backed `rest_admin`.
 * `isPalworld` remains for IPC compatibility and means "REST admin capable".
 */
export async function getPalworldRestStatus(
  appId: number,
  installPath: string
): Promise<PalworldRestStatusResponse> {
  ensureDefaultGameRestAdapters();
  const catalog = getCapabilityRepository();

  if (!isRestAdminApp(catalog, appId)) {
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
  const catalog = getCapabilityRepository();

  if (!isRestAdminApp(catalog, appId)) {
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
