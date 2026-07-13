import type { AutoUpdateServerResponse } from "../types/ipc";

import { getServerBuildId } from "./steamDetection";
import { getServerMapping, startServer, stopServer } from "./serverProcess";
import { resolveSteamCmdPath, runSteamCmdUpdate } from "./steamCmd";

/**
 * Backoff schedule for re-reading the app manifest after steamcmd finishes;
 * the manifest write can lag slightly behind the process exiting.
 */
const DEFAULT_BUILDID_POLL_DELAYS_MS = [1000, 2000, 4000];

interface AutoUpdateOptions {
  /** Explicit steamcmd path (from user settings). */
  steamCmdPath?: string;
  /** Override the buildid verification backoff schedule (used by tests). */
  buildIdPollDelaysMs?: number[];
  /** Override the steamcmd timeout (used by tests). */
  steamCmdTimeoutMs?: number;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Auto-update state machine: validate -> resolve steamcmd -> stop server ->
 * run steamcmd app_update (into installPath) -> verify buildid (with backoff)
 * -> always restart after a successful stop. `updated: true` means the
 * buildid changed; `stage: "no-update"` still restarts so the checkbox keeps
 * the server running after a check.
 */
export async function autoUpdateServer(
  appId: number,
  installPath: string,
  steamPath: string,
  options?: AutoUpdateOptions
): Promise<AutoUpdateServerResponse> {
  const pollDelaysMs =
    options?.buildIdPollDelaysMs ?? DEFAULT_BUILDID_POLL_DELAYS_MS;

  // Stage: validating
  const mappingEntry = getServerMapping(appId);
  if (!mappingEntry) {
    return {
      success: false,
      stage: "validating",
      updated: false,
      error: `Unknown server app ID or executable not defined: ${String(appId)}`,
    };
  }

  // Stage: resolving-steamcmd — resolved before stopping the server so a
  // missing steamcmd never leaves the server stopped for nothing.
  const steamCmdPath = resolveSteamCmdPath(options?.steamCmdPath);
  if (steamCmdPath === null) {
    const configuredHint =
      options?.steamCmdPath !== undefined && options.steamCmdPath.length > 0
        ? `Configured path not found: ${options.steamCmdPath}.`
        : "steamcmd was not found on this system.";
    return {
      success: false,
      stage: "resolving-steamcmd",
      updated: false,
      error: `${configuredHint} Install steamcmd or set its path in Settings to enable auto-updates.`,
    };
  }

  const previousBuildId = await getServerBuildId(appId, steamPath);

  // Stage: stopping
  const stopResult = stopServer(appId, installPath);
  if (!stopResult.success) {
    return {
      success: false,
      stage: "stopping",
      updated: false,
      previousBuildId,
      error: `Failed to stop server before update: ${stopResult.error ?? "unknown error"}`,
    };
  }

  // Stage: updating — target the managed install dir, not steamcmd's default.
  const updateResult = await runSteamCmdUpdate(
    steamCmdPath,
    appId,
    installPath,
    {
      timeoutMs: options?.steamCmdTimeoutMs,
    }
  );
  if (!updateResult.success) {
    const updateError = updateResult.error ?? "steamcmd update failed";
    const startResult = await startServer(appId, installPath);
    if (!startResult.success) {
      return {
        success: false,
        stage: "updating",
        updated: false,
        previousBuildId,
        error: `${updateError} Server was left stopped after the failed update: ${startResult.error ?? "unknown error"}`,
      };
    }
    return {
      success: false,
      stage: "updating",
      updated: false,
      previousBuildId,
      error: updateError,
    };
  }

  // Stage: verifying — poll the manifest buildid with backoff.
  let newBuildId = await getServerBuildId(appId, steamPath);
  for (const pollDelayMs of pollDelaysMs) {
    if (newBuildId !== null && newBuildId !== previousBuildId) {
      break;
    }
    await delay(pollDelayMs);
    newBuildId = await getServerBuildId(appId, steamPath);
  }

  const buildChanged =
    newBuildId !== null &&
    previousBuildId !== null &&
    newBuildId !== previousBuildId;

  // Stage: restarting — always bring the server back after a successful stop.
  const startResult = await startServer(appId, installPath);
  if (!startResult.success) {
    if (buildChanged) {
      return {
        success: false,
        stage: "restarting",
        updated: true,
        previousBuildId,
        newBuildId,
        error: `Server updated to build ${newBuildId} but failed to restart: ${startResult.error ?? "unknown error"}`,
      };
    }
    return {
      success: false,
      stage: "restarting",
      updated: false,
      previousBuildId,
      newBuildId,
      error: `Update check finished but failed to restart: ${startResult.error ?? "unknown error"}`,
    };
  }

  if (!buildChanged) {
    return {
      success: true,
      stage: "no-update",
      updated: false,
      previousBuildId,
      newBuildId,
    };
  }

  return {
    success: true,
    stage: "complete",
    updated: true,
    previousBuildId,
    newBuildId,
  };
}
