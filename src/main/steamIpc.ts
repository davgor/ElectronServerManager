import { execSync } from "child_process";

import { shell } from "electron";

import type {
  CheckDiagnosticsResponse,
  GetSteamServersResponse,
  IpcActionResult,
} from "../types/ipc";

import { getCommonSteamPaths } from "./driveUtils";
import * as logger from "./logger";
import { findInstalledServers } from "./steamDetection";

export function collectDiagnostics(): CheckDiagnosticsResponse {
  const diagnostics: CheckDiagnosticsResponse = {};

  try {
    execSync("echo test", { encoding: "utf8" });
    diagnostics.canExecuteProcesses = true;
  } catch {
    diagnostics.canExecuteProcesses = false;
  }

  diagnostics.platform = process.platform;

  try {
    const steamPaths = getCommonSteamPaths();
    diagnostics.steamFound = steamPaths.length > 0;
    diagnostics.steamPaths = steamPaths;
  } catch (err) {
    diagnostics.steamFound = false;
    diagnostics.steamError =
      err instanceof Error ? err.message : "Unknown error";
  }

  return diagnostics;
}

export function listSteamPaths(): string[] {
  try {
    return getCommonSteamPaths();
  } catch (error) {
    logger.error("Error getting Steam paths:", error);
    return [];
  }
}

export async function fetchSteamServers(
  path?: string
): Promise<GetSteamServersResponse> {
  try {
    const servers = await findInstalledServers(path);
    return { success: true, servers };
  } catch (error) {
    logger.error("Error finding Steam servers:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
      servers: [],
    };
  }
}

export async function openFileDefault(
  filePath: string
): Promise<IpcActionResult> {
  try {
    if (!filePath || typeof filePath !== "string") {
      return { success: false, error: "Invalid file path" };
    }

    const result = await shell.openPath(filePath);
    if (typeof result === "string" && result.length > 0) {
      return { success: false, error: result };
    }
    return { success: true };
  } catch (err) {
    logger.error("Error opening file:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
