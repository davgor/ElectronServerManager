import { execSync } from "child_process";

import { shell } from "electron";

import { findInstalledServers } from "./steamDetection";
import { getCommonSteamPaths } from "./driveUtils";

export function collectDiagnostics(): Record<
  string,
  boolean | string | string[]
> {
  const diagnostics: Record<string, boolean | string | string[]> = {};

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
    console.error("Error getting Steam paths:", error);
    return [];
  }
}

export async function fetchSteamServers(path?: string): Promise<{
  success: boolean;
  servers?: Awaited<ReturnType<typeof findInstalledServers>>;
  error?: string;
}> {
  try {
    const servers = await findInstalledServers(path);
    return { success: true, servers };
  } catch (error) {
    console.error("Error finding Steam servers:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
      servers: [],
    };
  }
}

export async function openFileDefault(
  filePath: string
): Promise<{ success: boolean; error?: string }> {
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
    // eslint-disable-next-line no-console
    console.error("Error opening file:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
