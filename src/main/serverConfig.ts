import path from "path";
import { promises as fs } from "fs";

import type {
  ConfigFormat,
  GetServerConfigResponse,
  IpcActionResult,
} from "../types/ipc";

import {
  STEAM_DEDICATED_SERVERS,
  resolveServerConfigLocation,
} from "./steamDetection";
import { parseIniContent, stringifyIniContent } from "./iniConfig";

type ConfigReadResult = GetServerConfigResponse;

type ConfigWriteResult = IpcActionResult;

function getServerConfigLocation(appId: number): string | null {
  if (
    !Object.prototype.hasOwnProperty.call(
      STEAM_DEDICATED_SERVERS,
      String(appId)
    )
  ) {
    return null;
  }

  const serverInfo =
    STEAM_DEDICATED_SERVERS[
      appId as unknown as keyof typeof STEAM_DEDICATED_SERVERS
    ];

  const configLocation = resolveServerConfigLocation(serverInfo);
  if (configLocation === undefined || configLocation === "") {
    return null;
  }

  return configLocation;
}

export async function getServerConfig(
  appId: number,
  installPath: string
): Promise<ConfigReadResult> {
  try {
    const configLocation = getServerConfigLocation(appId);
    if (configLocation === null) {
      return { success: false, error: `No config mapping for app ${appId}` };
    }

    const configPath = path.join(installPath, configLocation);

    try {
      await fs.stat(configPath);
    } catch {
      return {
        success: false,
        error: `Config file not found: ${configPath}`,
      };
    }

    const content = await fs.readFile(configPath, "utf-8");
    const format = configPath.toLowerCase().endsWith(".json") ? "json" : "ini";

    let parsed: Record<string, unknown> = {};
    if (format === "json") {
      parsed = JSON.parse(content) as Record<string, unknown>;
    } else {
      parsed = parseIniContent(content);
    }

    return { success: true, content: parsed, format, filePath: configPath };
  } catch (err) {
    console.error("Error reading server config:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function saveServerConfig(
  appId: number,
  installPath: string,
  content: Record<string, unknown>,
  format: ConfigFormat
): Promise<ConfigWriteResult> {
  try {
    const configLocation = getServerConfigLocation(appId);
    if (configLocation === null) {
      return { success: false, error: `No config mapping for app ${appId}` };
    }

    const configPath = path.join(installPath, configLocation);

    let fileContent = "";
    if (format === "json") {
      fileContent = JSON.stringify(content, null, 2);
    } else {
      fileContent = stringifyIniContent(content);
    }

    await fs.writeFile(configPath, fileContent, "utf-8");
    return { success: true };
  } catch (err) {
    console.error("Error saving server config:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
