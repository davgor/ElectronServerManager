import type {
  IpcActionResult,
  PalworldRestCallResult,
  PalworldRestStatusResponse,
} from "../types/ipc";

import type { PalworldRestEndpoint } from "./palworldRest";
import { getServerConfig } from "./serverConfig";
import {
  callPalworldRest,
  extractPalworldRestConfig,
  PALWORLD_APP_ID,
} from "./palworldRest";

export async function getPalworldRestStatus(
  appId: number,
  installPath: string
): Promise<PalworldRestStatusResponse> {
  if (appId !== PALWORLD_APP_ID) {
    return {
      success: true,
      enabled: false,
      isPalworld: false,
    };
  }

  const configResult = await getServerConfig(appId, installPath);
  if (!configResult.success || configResult.content === undefined) {
    return {
      success: false,
      enabled: false,
      isPalworld: true,
      error: configResult.error ?? "Failed to read Palworld config",
    };
  }

  const rest = extractPalworldRestConfig(configResult.content);
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
  if (appId !== PALWORLD_APP_ID) {
    return {
      success: false,
      error: "Palworld REST API is only available for Palworld servers",
    };
  }

  const configResult = await getServerConfig(appId, installPath);
  if (!configResult.success || configResult.content === undefined) {
    return {
      success: false,
      error: configResult.error ?? "Failed to read Palworld config",
    };
  }

  const rest = extractPalworldRestConfig(configResult.content);
  return callPalworldRest(rest, { method, endpoint, body });
}

export type { IpcActionResult };
