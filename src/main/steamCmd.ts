import os from "os";
import path from "path";
import { existsSync } from "fs";
import { spawn, execSync } from "child_process";

import type { IpcActionResult, SelectSteamCmdPathResponse } from "../types/ipc";

import * as logger from "./logger";

/** Default upper bound for a steamcmd app_update run (large depots are slow). */
const DEFAULT_STEAMCMD_TIMEOUT_MS = 15 * 60 * 1000;

/** App-info checks are metadata-only and should finish quickly. */
const DEFAULT_APP_INFO_TIMEOUT_MS = 60 * 1000;

/** Cap captured output so a chatty steamcmd cannot grow buffers unbounded. */
const MAX_CAPTURED_OUTPUT_CHARS = 8192;

/** app_info_print can be large; keep enough to reach branches.public.buildid. */
const MAX_APP_INFO_OUTPUT_CHARS = 256 * 1024;

interface RunSteamCmdOptions {
  timeoutMs?: number;
}

interface SteamCmdFileDialog {
  showOpenDialog(
    parent: unknown,
    options: {
      properties: string[];
      title: string;
      filters?: Array<{ name: string; extensions: string[] }>;
    }
  ): Promise<{ canceled: boolean; filePaths: string[] }>;
}

export interface RemoteBuildIdResult {
  success: boolean;
  buildId?: string;
  error?: string;
}

function wellKnownSteamCmdLocations(): string[] {
  const home = os.homedir();
  if (process.platform === "win32") {
    return [
      "C:\\steamcmd\\steamcmd.exe",
      path.join(home, "steamcmd", "steamcmd.exe"),
    ];
  }
  return [
    "/usr/bin/steamcmd",
    "/usr/games/steamcmd",
    "/usr/local/bin/steamcmd",
    path.join(home, "steamcmd", "steamcmd.sh"),
    path.join(home, "Steam", "steamcmd.sh"),
  ];
}

function findSteamCmdOnPath(): string | null {
  const lookupCommand =
    process.platform === "win32" ? "where steamcmd" : "which steamcmd";
  try {
    const output = execSync(lookupCommand, { encoding: "utf8" });
    const firstLine = output.split(/\r?\n/)[0]?.trim() ?? "";
    return firstLine.length > 0 ? firstLine : null;
  } catch {
    return null;
  }
}

/**
 * Resolve the steamcmd executable to use.
 *
 * Order: explicitly configured path (must exist) -> PATH lookup ->
 * well-known install locations. Returns null when steamcmd cannot be found,
 * so callers can surface a clear "install steamcmd or set its path" error.
 */
export function resolveSteamCmdPath(configuredPath?: string): string | null {
  if (configuredPath !== undefined && configuredPath.trim().length > 0) {
    return existsSync(configuredPath) ? configuredPath : null;
  }

  const onPath = findSteamCmdOnPath();
  if (onPath !== null) {
    return onPath;
  }

  for (const candidate of wellKnownSteamCmdLocations()) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

/**
 * Extract the public-branch buildid from SteamCMD `app_info_print` output.
 * Prefers the buildid under `"branches" → "public"`, ignoring other branches.
 */
export function parsePublicBranchBuildId(appInfoOutput: string): string | null {
  const branchesIdx = appInfoOutput.search(/"branches"\s*\{/i);
  if (branchesIdx < 0) {
    return null;
  }
  const afterBranches = appInfoOutput.slice(branchesIdx);
  const publicIdx = afterBranches.search(/"public"\s*\{/i);
  if (publicIdx < 0) {
    return null;
  }
  const afterPublic = afterBranches.slice(publicIdx);
  const buildMatch = afterPublic.match(/"buildid"\s+"(\d+)"/i);
  return buildMatch?.[1] ?? null;
}

/**
 * Query the remote public-branch buildid via SteamCMD without touching the
 * install directory (`app_info_update` + `app_info_print`, no `app_update`).
 * Print is issued twice because the first call often only refreshes the cache.
 */
export function fetchRemoteAppBuildId(
  steamCmdPath: string,
  appId: number,
  options?: RunSteamCmdOptions
): Promise<RemoteBuildIdResult> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_APP_INFO_TIMEOUT_MS;

  return new Promise((resolve) => {
    let settled = false;
    let output = "";

    const settle = (result: RemoteBuildIdResult): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeoutHandle);
      resolve(result);
    };

    const child = spawn(
      steamCmdPath,
      [
        "+login",
        "anonymous",
        "+app_info_update",
        "1",
        "+app_info_print",
        String(appId),
        "+app_info_print",
        String(appId),
        "+quit",
      ],
      { shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] }
    );

    const timeoutHandle = setTimeout(() => {
      child.kill();
      settle({
        success: false,
        error: `steamcmd timed out after ${String(timeoutMs)}ms while checking app info for ${String(appId)}`,
      });
    }, timeoutMs);

    const captureOutput = (data: Buffer): void => {
      if (output.length < MAX_APP_INFO_OUTPUT_CHARS) {
        output += data.toString();
      }
    };
    child.stdout.on("data", captureOutput);
    child.stderr.on("data", captureOutput);

    child.on("error", (err: Error) => {
      settle({
        success: false,
        error: `Failed to run steamcmd at ${steamCmdPath}: ${err.message}`,
      });
    });

    child.on("exit", (code) => {
      if (code === 0 || code === 7) {
        const buildId = parsePublicBranchBuildId(output);
        if (buildId === null) {
          settle({
            success: false,
            error: `Could not parse remote public buildid from steamcmd app info for app ${String(appId)}`,
          });
          return;
        }
        settle({ success: true, buildId });
        return;
      }
      const detail =
        output.trim().length > 0 ? ` Output: ${output.trim()}` : "";
      settle({
        success: false,
        error: `steamcmd exited with exit code ${String(code)} while checking app info for app ${String(appId)}.${detail}`,
      });
    });
  });
}

/**
 * Run `steamcmd +force_install_dir <installPath> +login anonymous +app_update
 * <appId> validate +quit` and resolve with the outcome. Never rejects;
 * failures (including timeouts and spawn errors) resolve as
 * `{ success: false, error }`.
 *
 * `+force_install_dir` must come before login/app_update so the depot lands
 * in the managed server install, not steamcmd's default library.
 */
export function runSteamCmdUpdate(
  steamCmdPath: string,
  appId: number,
  installPath: string,
  options?: RunSteamCmdOptions
): Promise<IpcActionResult> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_STEAMCMD_TIMEOUT_MS;

  return new Promise((resolve) => {
    let settled = false;
    let output = "";

    const settle = (result: IpcActionResult): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeoutHandle);
      resolve(result);
    };

    const child = spawn(
      steamCmdPath,
      [
        "+force_install_dir",
        installPath,
        "+login",
        "anonymous",
        "+app_update",
        String(appId),
        "validate",
        "+quit",
      ],
      { shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] }
    );

    const timeoutHandle = setTimeout(() => {
      child.kill();
      settle({
        success: false,
        error: `steamcmd timed out after ${String(timeoutMs)}ms while updating app ${String(appId)}`,
      });
    }, timeoutMs);

    const captureOutput = (data: Buffer): void => {
      if (output.length < MAX_CAPTURED_OUTPUT_CHARS) {
        output += data.toString();
      }
    };
    child.stdout.on("data", captureOutput);
    child.stderr.on("data", captureOutput);

    child.on("error", (err: Error) => {
      settle({
        success: false,
        error: `Failed to run steamcmd at ${steamCmdPath}: ${err.message}`,
      });
    });

    child.on("exit", (code) => {
      // steamcmd is known to exit with code 7 on Windows after a successful
      // run that triggered a self-update; treat it as success.
      if (code === 0 || code === 7) {
        settle({ success: true });
        return;
      }
      const detail =
        output.trim().length > 0 ? ` Output: ${output.trim()}` : "";
      settle({
        success: false,
        error: `steamcmd exited with exit code ${String(code)} while updating app ${String(appId)}.${detail}`,
      });
    });
  });
}

/**
 * Open a native file picker for the steamcmd executable.
 * Mirrors selectBackupFolder but selects a file instead of a directory.
 */
export async function selectSteamCmdPath(
  getMainWindow: () => unknown,
  dialogApi: SteamCmdFileDialog
): Promise<SelectSteamCmdPathResponse> {
  try {
    const mainWindow = getMainWindow();
    if (mainWindow === null || mainWindow === undefined) {
      return {
        success: false,
        path: null,
        error: "Main window not available",
      };
    }

    const result = await dialogApi.showOpenDialog(mainWindow, {
      properties: ["openFile"],
      title: "Select SteamCMD Executable",
      filters: [
        { name: "Executables", extensions: ["exe", "sh", "bat", "cmd"] },
        { name: "All Files", extensions: ["*"] },
      ],
    });

    if (result.canceled) {
      return { success: false, path: null };
    }

    const selectedPath = result.filePaths[0];
    logger.info(`SteamCMD path selected: ${selectedPath}`);

    return { success: true, path: selectedPath };
  } catch (error) {
    logger.error("Error selecting SteamCMD path:", error);
    return {
      success: false,
      path: null,
      error:
        error instanceof Error ? error.message : "Failed to select SteamCMD",
    };
  }
}
