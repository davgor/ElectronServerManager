import os from "os";
import path from "path";
import { existsSync } from "fs";
import { spawn, execSync } from "child_process";

import type { IpcActionResult } from "../types/ipc";

/** Default upper bound for a steamcmd app_update run (large depots are slow). */
const DEFAULT_STEAMCMD_TIMEOUT_MS = 15 * 60 * 1000;

/** Cap captured output so a chatty steamcmd cannot grow buffers unbounded. */
const MAX_CAPTURED_OUTPUT_CHARS = 8192;

interface RunSteamCmdOptions {
  timeoutMs?: number;
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
 * Run `steamcmd +login anonymous +app_update <appId> validate +quit` and
 * resolve with the outcome. Never rejects; failures (including timeouts and
 * spawn errors) resolve as `{ success: false, error }`.
 */
export function runSteamCmdUpdate(
  steamCmdPath: string,
  appId: number,
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
