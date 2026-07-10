import path from "path";
import { existsSync } from "fs";
import { spawn, spawnSync } from "child_process";

import type { IpcActionResult } from "../types/ipc";

import {
  STEAM_DEDICATED_SERVERS,
  ServerInfo,
  isProcessRunning,
  resolveServerExecutable,
} from "./steamDetection";

type ServerActionResult = IpcActionResult;

/** How long to wait after spawning before verifying the process stayed up. */
const STARTUP_VERIFY_DELAY_MS = 2000;

/** Cap captured stderr so a chatty server cannot grow the buffer unbounded. */
const MAX_CAPTURED_STDERR_CHARS = 8192;

interface StartServerOptions {
  /** Override the post-spawn verification delay (used by tests). */
  startupVerifyDelayMs?: number;
}

/**
 * PIDs of server processes started by this app, keyed by Steam appId.
 * Lets stop-server target the exact process instead of a name-based kill.
 */
const trackedPids = new Map<number, number>();

export function getTrackedPid(appId: number): number | undefined {
  return trackedPids.get(appId);
}

export function resetTrackedPidsForTests(): void {
  trackedPids.clear();
}

export function getServerMapping(appId: number): ServerInfo | null {
  const mappingEntry = (
    STEAM_DEDICATED_SERVERS as Record<string, ServerInfo | undefined>
  )[String(appId)];
  if (
    !mappingEntry ||
    typeof mappingEntry.executable !== "string" ||
    mappingEntry.executable.length === 0
  ) {
    return null;
  }
  return mappingEntry;
}

interface KillCommand {
  command: string;
  args: string[];
}

export function buildKillCommand(
  executable: string,
  platform: string = process.platform
): KillCommand {
  const exeName = path.basename(executable, path.extname(executable));
  if (platform === "win32") {
    return { command: "taskkill", args: ["/F", "/IM", `${exeName}.exe`] };
  }
  return { command: "pkill", args: ["-f", exeName] };
}

function describeKillFailure(
  result: ReturnType<typeof spawnSync>,
  command: string
): string {
  if (result.error) {
    return result.error.message;
  }
  const stderr = result.stderr.toString().trim();
  const detail = stderr.length > 0 ? `: ${stderr}` : "";
  return `${command} exited with code ${String(result.status)}${detail}`;
}

/**
 * Kill a server process by executable name. Only used as a fallback when no
 * tracked PID is available; the match is as narrow as name-based matching
 * allows. "No process matched" is treated as success (already stopped).
 */
export function killServerProcessByName(
  executable: string
): ServerActionResult {
  const { command, args } = buildKillCommand(executable);
  const result = spawnSync(command, args);

  if (result.error === undefined && result.status !== null) {
    // pkill exits 1 when nothing matched; taskkill exits 128 when the
    // process was not found. Both mean the server is already stopped.
    const noMatchStatus = process.platform === "win32" ? 128 : 1;
    if (result.status === 0 || result.status === noMatchStatus) {
      return { success: true };
    }
  }

  const message = describeKillFailure(result, command);
  console.error(`Failed to kill process by name (${executable}):`, message);
  return {
    success: false,
    error: `Failed to stop server process: ${message}`,
  };
}

function killTrackedPid(appId: number, pid: number): ServerActionResult {
  if (process.platform === "win32") {
    const result = spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"]);
    // taskkill exits 128 when the process was not found (already exited).
    if (
      result.error === undefined &&
      (result.status === 0 || result.status === 128)
    ) {
      trackedPids.delete(appId);
      return { success: true };
    }
    return {
      success: false,
      error: `Failed to stop server (PID ${String(pid)}): ${describeKillFailure(result, "taskkill")}`,
    };
  }

  try {
    process.kill(pid, "SIGTERM");
    trackedPids.delete(appId);
    return { success: true };
  } catch (error) {
    const errno = error as NodeJS.ErrnoException;
    if (errno.code === "ESRCH") {
      // Process already exited.
      trackedPids.delete(appId);
      return { success: true };
    }
    return {
      success: false,
      error: `Failed to stop server (PID ${pid}): ${errno.message}`,
    };
  }
}

interface SpawnOutcome {
  errored: Error | null;
  exited: { code: number | null; signal: NodeJS.Signals | null } | null;
  stderr: string;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function startServer(
  appId: number,
  installPath: string,
  options?: StartServerOptions
): Promise<ServerActionResult> {
  const startupVerifyDelayMs =
    options?.startupVerifyDelayMs ?? STARTUP_VERIFY_DELAY_MS;

  try {
    const mappingEntry = getServerMapping(appId);
    if (!mappingEntry) {
      return {
        success: false,
        error: `Unknown server app ID or executable not defined: ${appId}`,
      };
    }

    const executable = resolveServerExecutable(mappingEntry);
    const serverExePath = path.join(installPath, executable);

    if (!existsSync(serverExePath)) {
      console.error(`Server executable not found: ${serverExePath}`);
      return {
        success: false,
        error: `Server executable not found at: ${serverExePath}. Please verify the installation path.`,
      };
    }

    if (!existsSync(installPath)) {
      console.error(`Install directory not found: ${installPath}`);
      return {
        success: false,
        error: `Install directory not found: ${installPath}`,
      };
    }

    const serverProcess = spawn(serverExePath, [], {
      cwd: installPath,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });

    const outcome: SpawnOutcome = { errored: null, exited: null, stderr: "" };

    serverProcess.on("error", (err: Error) => {
      outcome.errored = err;
      console.error(`Spawn error for ${executable}: ${err.message}`);
    });

    serverProcess.stderr.on("data", (data: Buffer) => {
      if (outcome.stderr.length < MAX_CAPTURED_STDERR_CHARS) {
        outcome.stderr += data.toString();
      }
    });

    serverProcess.on("exit", (code, signal) => {
      outcome.exited = { code, signal };
      if (
        serverProcess.pid !== undefined &&
        trackedPids.get(appId) === serverProcess.pid
      ) {
        trackedPids.delete(appId);
      }
    });

    if (serverProcess.pid !== undefined) {
      trackedPids.set(appId, serverProcess.pid);
    }

    await delay(startupVerifyDelayMs);

    if (outcome.errored !== null) {
      trackedPids.delete(appId);
      return {
        success: false,
        error: `Failed to start server: ${outcome.errored.message}`,
      };
    }

    if (outcome.exited !== null) {
      trackedPids.delete(appId);
      const { code, signal } = outcome.exited;
      const detail =
        outcome.stderr.trim().length > 0
          ? ` Output: ${outcome.stderr.trim()}`
          : "";
      return {
        success: false,
        error: `Server process exited immediately (code ${String(code)}, signal ${String(signal)}).${detail}`,
      };
    }

    if (!isProcessRunning(executable)) {
      trackedPids.delete(appId);
      return {
        success: false,
        error: `Server process is not detectable after startup. It may have failed to launch.`,
      };
    }

    serverProcess.unref();

    return { success: true };
  } catch (error) {
    console.error("Error starting server:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to start server",
    };
  }
}

export function stopServer(
  appId: number,
  _installPath: string
): ServerActionResult {
  try {
    const mappingEntry = getServerMapping(appId);
    if (!mappingEntry) {
      return {
        success: false,
        error: `Unknown server app ID or executable not defined: ${appId}`,
      };
    }

    const trackedPid = trackedPids.get(appId);
    if (trackedPid !== undefined) {
      return killTrackedPid(appId, trackedPid);
    }

    // No PID tracked (e.g. server started outside this app): fall back to a
    // name-based kill for the resolved executable.
    return killServerProcessByName(resolveServerExecutable(mappingEntry));
  } catch (error) {
    console.error("Error stopping server:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to stop server",
    };
  }
}
