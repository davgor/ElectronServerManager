import path from "path";
import { existsSync } from "fs";
import { spawn, execSync } from "child_process";

import type { IpcActionResult } from "../types/ipc";

import {
  STEAM_DEDICATED_SERVERS,
  ServerInfo,
  getServerBuildId,
} from "./steamDetection";

type ServerActionResult = IpcActionResult;

function getServerMapping(appId: number): ServerInfo | null {
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

export function buildKillCommand(
  executable: string,
  platform: string = process.platform
): string {
  const exeName = path.basename(executable, path.extname(executable));
  if (platform === "win32") {
    return `taskkill /F /IM ${exeName}.exe 2>nul || exit /b 0`;
  }
  return `pkill -f "${exeName}" || true`;
}

export function killServerProcess(executable: string): void {
  const killCommand = buildKillCommand(executable);
  try {
    execSync(killCommand);
  } catch {
    // Process might not be running
  }
}

function spawnServerDetached(installPath: string, executable: string): void {
  const serverExePath = path.join(installPath, executable);
  const quotedPath = `"${serverExePath}"`;

  // eslint-disable-next-line no-console
  console.log(`Attempting to spawn: ${quotedPath} from ${installPath}`);

  const serverProcess = spawn(quotedPath, [], {
    cwd: installPath,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
    shell: true,
  });

  let errorOutput = "";

  serverProcess.on("error", (err: NodeJS.ErrnoException) => {
    // eslint-disable-next-line no-console
    console.error(
      `Spawn error for ${executable}: ${err.message} (code: ${err.code})`
    );
  });

  serverProcess.stderr.on("data", (data: Buffer) => {
    errorOutput += data.toString();
    // eslint-disable-next-line no-console
    console.error(`Server stderr: ${data.toString()}`);
  });

  serverProcess.stdout.on("data", (data: Buffer) => {
    // eslint-disable-next-line no-console
    console.log(`Server stdout: ${data.toString()}`);
  });

  serverProcess.on("exit", (code, signal) => {
    // eslint-disable-next-line no-console
    console.log(`Server process exited with code ${code}, signal ${signal}`);
    if (code !== 0 && errorOutput) {
      // eslint-disable-next-line no-console
      console.error(`Server error output: ${errorOutput}`);
    }
  });

  serverProcess.unref();

  // eslint-disable-next-line no-console
  console.log(`Server spawn called for: ${executable}`);
}

export function startServer(
  appId: number,
  installPath: string
): ServerActionResult {
  try {
    // eslint-disable-next-line no-console
    console.log(`Starting server ${appId} at: ${installPath}`);

    const mappingEntry = getServerMapping(appId);
    if (!mappingEntry) {
      return {
        success: false,
        error: `Unknown server app ID or executable not defined: ${appId}`,
      };
    }

    const serverExePath = path.join(installPath, mappingEntry.executable);

    if (!existsSync(serverExePath)) {
      // eslint-disable-next-line no-console
      console.error(`Server executable not found: ${serverExePath}`);
      return {
        success: false,
        error: `Server executable not found at: ${serverExePath}. Please verify the installation path.`,
      };
    }

    if (!existsSync(installPath)) {
      // eslint-disable-next-line no-console
      console.error(`Install directory not found: ${installPath}`);
      return {
        success: false,
        error: `Install directory not found: ${installPath}`,
      };
    }

    spawnServerDetached(installPath, mappingEntry.executable);

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
  installPath: string
): ServerActionResult {
  try {
    // eslint-disable-next-line no-console
    console.log(`Stopping server ${appId} at: ${installPath}`);

    const mappingEntry = getServerMapping(appId);
    if (!mappingEntry) {
      return {
        success: false,
        error: `Unknown server app ID or executable not defined: ${appId}`,
      };
    }

    killServerProcess(mappingEntry.executable);

    // eslint-disable-next-line no-console
    console.log(`Stop command sent for server ${appId}`);

    return { success: true };
  } catch (error) {
    console.error("Error stopping server:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to stop server",
    };
  }
}

export async function autoUpdateServer(
  appId: number,
  installPath: string,
  steamPath: string
): Promise<ServerActionResult> {
  try {
    // eslint-disable-next-line no-console
    console.log(`Starting auto-update for server ${appId}`);

    const mappingEntry = getServerMapping(appId);
    if (!mappingEntry) {
      return {
        success: false,
        error: `Unknown server app ID or executable not defined: ${appId}`,
      };
    }

    const currentBuildId = await getServerBuildId(appId, steamPath);
    // eslint-disable-next-line no-console
    console.log(`Current buildid for app ${appId}: ${currentBuildId}`);

    killServerProcess(mappingEntry.executable);
    // eslint-disable-next-line no-console
    console.log(`Stopped server ${appId} for update`);

    // eslint-disable-next-line no-console
    console.log(`Waiting for Steam update to complete...`);
    await new Promise((resolve) => setTimeout(resolve, 10000));

    const newBuildId = await getServerBuildId(appId, steamPath);
    // eslint-disable-next-line no-console
    console.log(`Buildid after update check for app ${appId}: ${newBuildId}`);

    if (newBuildId === null || newBuildId === currentBuildId) {
      // eslint-disable-next-line no-console
      console.log(`No update available for server ${appId}`);
      return { success: false, error: "No update available" };
    }

    // eslint-disable-next-line no-console
    console.log(`Update detected for server ${appId}, restarting...`);

    const serverExePath = path.join(installPath, mappingEntry.executable);
    // eslint-disable-next-line no-console
    console.log(
      `Attempting to spawn updated server: "${serverExePath}" from ${installPath}`
    );

    spawnServerDetached(installPath, mappingEntry.executable);

    // eslint-disable-next-line no-console
    console.log(`Server ${appId} restarted after update`);

    return { success: true };
  } catch (error) {
    console.error("Error during auto-update:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Auto-update failed",
    };
  }
}
