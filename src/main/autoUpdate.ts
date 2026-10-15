import type { AutoUpdateServerResponse } from "../types/ipc";

import { getCapabilityRepository } from "./catalog/capabilityRepository";
import { getGameQuerySnapshot } from "./gameQueryIpc";
import * as logger from "./logger";
import { getServerBuildId } from "./steamDetection";
import { getServerMapping, startServer, stopServer } from "./serverProcess";
import {
  fetchRemoteAppBuildId,
  resolveSteamCmdPath,
  runSteamCmdUpdate,
} from "./steamCmd";
import { getPalworldRestStatus, invokePalworldRest } from "./palworldRestIpc";

/**
 * Backoff schedule for re-reading the app manifest after steamcmd finishes;
 * the manifest write can lag slightly behind the process exiting.
 */
const DEFAULT_BUILDID_POLL_DELAYS_MS = [1000, 2000, 4000];

/**
 * Player warn window before stop/update when Palworld REST announce is
 * available. Query-protocol games never wait: they defer while occupied.
 */
const DEFAULT_WARN_BEFORE_UPDATE_MS = 5 * 60 * 1000;

export const UPDATE_REBOOT_WARN_MESSAGE =
  "An update is available. The server will reboot in 5 minutes.";

interface AutoUpdateOptions {
  /** Explicit steamcmd path (from user settings). */
  steamCmdPath?: string;
  /** Override the buildid verification backoff schedule (used by tests). */
  buildIdPollDelaysMs?: number[];
  /** Override the steamcmd timeout (used by tests). */
  steamCmdTimeoutMs?: number;
  /** Override the REST announce → reboot delay (used by tests). */
  warnBeforeUpdateMs?: number;
}

const inFlightAppIds = new Set<number>();

export function resetAutoUpdateForTests(): void {
  inFlightAppIds.clear();
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type PlayerGateResult =
  | { kind: "empty" }
  | { kind: "occupied"; playersOnline: number }
  | { kind: "unknown"; detail: string };

/**
 * Query-protocol games (Enshrouded) cannot announce a reboot, so the only
 * honest protection is to not reboot while anyone is playing. Bots are not
 * players; a non-empty player list counts even if the info count says 0. A
 * failed query is "unknown" — callers fail closed on it.
 */
async function checkPlayersOnline(
  appId: number,
  installPath: string
): Promise<PlayerGateResult> {
  const snapshot = await getGameQuerySnapshot(appId, installPath);
  if (!snapshot.success || snapshot.info === undefined) {
    const reason = snapshot.error ?? "unknown query error";
    return {
      kind: "unknown",
      detail:
        snapshot.errorKind === undefined
          ? reason
          : `${snapshot.errorKind}: ${reason}`,
    };
  }
  // Lean toward deferring: trust whichever source reports more people (the
  // info count can lag the player list on some Steamworks servers).
  const listedPlayers = snapshot.players?.length ?? 0;
  const playersOnline = Math.max(
    snapshot.info.players - snapshot.info.bots,
    listedPlayers
  );
  return playersOnline > 0
    ? { kind: "occupied", playersOnline }
    : { kind: "empty" };
}

/**
 * Auto-update state machine: validate -> resolve steamcmd -> compare local vs
 * remote buildid (no stop) -> only if they differ: protect players when the
 * catalog grants `update_announce` (REST games: announce + wait when REST is
 * enabled; query games: defer while players are online) -> stop server -> run
 * steamcmd app_update (into installPath) -> verify buildid (with backoff) ->
 * always restart after a successful stop. `updated: true` means the buildid
 * changed; matching versions return `stage: "no-update"` and occupied query
 * servers return `stage: "deferred"`, both without interrupting the server.
 */
export async function autoUpdateServer(
  appId: number,
  installPath: string,
  steamPath: string,
  options?: AutoUpdateOptions
): Promise<AutoUpdateServerResponse> {
  if (inFlightAppIds.has(appId)) {
    return {
      success: true,
      stage: "no-update",
      updated: false,
    };
  }
  inFlightAppIds.add(appId);

  try {
    return await runAutoUpdate(appId, installPath, steamPath, options);
  } finally {
    inFlightAppIds.delete(appId);
  }
}

async function runAutoUpdate(
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

  const previousBuildId = await getServerBuildId(appId, steamPath, installPath);

  // Stage: checking — compare local vs remote without interrupting the server.
  if (previousBuildId === null) {
    return {
      success: false,
      stage: "checking",
      updated: false,
      previousBuildId,
      error: `Could not read local buildid for app ${String(appId)}; left server running.`,
    };
  }

  const remoteResult = await fetchRemoteAppBuildId(steamCmdPath, appId, {
    timeoutMs: options?.steamCmdTimeoutMs,
  });
  if (!remoteResult.success || remoteResult.buildId === undefined) {
    return {
      success: false,
      stage: "checking",
      updated: false,
      previousBuildId,
      error: `${remoteResult.error ?? "Failed to check remote buildid"} Server was left running.`,
    };
  }

  if (remoteResult.buildId === previousBuildId) {
    return {
      success: true,
      stage: "no-update",
      updated: false,
      previousBuildId,
      newBuildId: previousBuildId,
    };
  }

  // Stage: notifying — protect players when the catalog says so.
  const catalog = getCapabilityRepository();
  if (
    catalog.hasCapability(appId, "update_announce") &&
    catalog.getOpsProtocol(appId) === "query"
  ) {
    const gate = await checkPlayersOnline(appId, installPath);
    if (gate.kind === "unknown") {
      return {
        success: false,
        stage: "notifying",
        updated: false,
        previousBuildId,
        error: `Could not check for online players before updating (${gate.detail}). Update deferred; server was left running.`,
      };
    }
    if (gate.kind === "occupied") {
      logger.info(
        `Auto-update for app ${String(appId)} deferred: ${String(gate.playersOnline)} player(s) online.`
      );
      return {
        success: true,
        stage: "deferred",
        updated: false,
        previousBuildId,
        playersOnline: gate.playersOnline,
      };
    }
  } else if (catalog.hasCapability(appId, "update_announce")) {
    // REST announce + warn window.
    const restStatus = await getPalworldRestStatus(appId, installPath);
    if (restStatus.success && restStatus.isPalworld && restStatus.enabled) {
      const announceResult = await invokePalworldRest(
        appId,
        installPath,
        "POST",
        "announce",
        { message: UPDATE_REBOOT_WARN_MESSAGE }
      );
      if (!announceResult.success) {
        return {
          success: false,
          stage: "notifying",
          updated: false,
          previousBuildId,
          error: `Failed to announce update warning: ${announceResult.error ?? "unknown error"} Server was left running.`,
        };
      }

      const warnMs =
        options?.warnBeforeUpdateMs ?? DEFAULT_WARN_BEFORE_UPDATE_MS;
      if (warnMs > 0) {
        await delay(warnMs);
      }
    }
  }

  // Stage: stopping — only when an update is actually available.
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

  // Stage: verifying — poll the manifest buildid with backoff until it
  // reaches the remote buildid. steamcmd exiting 0/7 is not proof of a
  // complete download (anonymous logins can partially sync), so success
  // requires the library manifest beside the install to match remote.
  const remoteBuildId = remoteResult.buildId;
  let newBuildId = await getServerBuildId(appId, steamPath, installPath);
  for (const pollDelayMs of pollDelaysMs) {
    if (newBuildId === remoteBuildId) {
      break;
    }
    await delay(pollDelayMs);
    newBuildId = await getServerBuildId(appId, steamPath, installPath);
  }

  const updateComplete = newBuildId === remoteBuildId;
  const incompleteDetail =
    newBuildId === null
      ? `steamcmd finished but no app manifest with a buildid was found for the install; the update did not complete.`
      : `steamcmd finished but the manifest buildid is ${newBuildId} instead of remote ${remoteBuildId}; the update did not complete.`;

  // Stage: restarting — always bring the server back after a successful stop.
  const startResult = await startServer(appId, installPath);
  if (!startResult.success) {
    if (updateComplete) {
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
      error: `${incompleteDetail} The server also failed to restart: ${startResult.error ?? "unknown error"}`,
    };
  }

  if (!updateComplete) {
    return {
      success: false,
      stage: "verifying",
      updated: false,
      previousBuildId,
      newBuildId,
      error: `${incompleteDetail} The server was restarted on the previous build. See the app logs for steamcmd output.`,
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
