import type { BrowserWindow } from "electron";
import type {
  AppUpdater,
  ProgressInfo,
  UpdateDownloadedEvent,
  UpdateInfo,
} from "electron-updater";

import type { AppUpdateStatus } from "../types/ipc";

import * as logger from "./logger";

const APP_UPDATE_STATUS_EVENT = "app-update-status";

/** How often to re-check while the app stays open (Discord-style background polling). */
export const DEFAULT_POLL_INTERVAL_MS = 4 * 60 * 60 * 1000;

interface AppUpdaterDeps {
  autoUpdater: Pick<
    AppUpdater,
    | "checkForUpdates"
    | "downloadUpdate"
    | "quitAndInstall"
    | "on"
    | "logger"
    | "autoDownload"
    | "autoInstallOnAppQuit"
  >;
  getMainWindow: () => BrowserWindow | null;
  isPackaged: boolean;
  currentVersion: string;
  /** Injectable poll interval for tests; defaults to DEFAULT_POLL_INTERVAL_MS. */
  pollIntervalMs?: number;
}

let activeDeps: AppUpdaterDeps | null = null;
let lastStatus: AppUpdateStatus = { state: "idle" };
let checkInFlight = false;
let pollTimer: ReturnType<typeof setInterval> | null = null;

export function resetAppUpdaterForTests(): void {
  if (pollTimer !== null) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  activeDeps = null;
  lastStatus = { state: "idle" };
  checkInFlight = false;
}

export function getLastAppUpdateStatus(): AppUpdateStatus {
  return lastStatus;
}

export function canStartAppUpdateCheck(
  state: AppUpdateStatus["state"]
): boolean {
  return state === "idle" || state === "not-available" || state === "error";
}

function broadcast(status: AppUpdateStatus): void {
  lastStatus = status;
  const window = activeDeps?.getMainWindow() ?? null;
  if (window !== null && !window.isDestroyed()) {
    window.webContents.send(APP_UPDATE_STATUS_EVENT, status);
  }
}

function wireAutoUpdaterEvents(deps: AppUpdaterDeps): void {
  const { autoUpdater } = deps;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  // electron-updater accepts electron-log-compatible loggers; our structured
  // logger is enough for console/file visibility in packaged builds.
  autoUpdater.logger = {
    info: (...args: unknown[]) => logger.info(String(args[0] ?? "")),
    warn: (...args: unknown[]) => logger.warn(String(args[0] ?? "")),
    error: (...args: unknown[]) => logger.error(String(args[0] ?? "")),
    debug: (...args: unknown[]) => logger.debug(String(args[0] ?? "")),
  } as AppUpdater["logger"];

  autoUpdater.on("checking-for-update", () => {
    broadcast({ state: "checking" });
  });

  autoUpdater.on("update-available", (info: UpdateInfo) => {
    broadcast({
      state: "available",
      version: info.version,
      currentVersion: deps.currentVersion,
    });
  });

  autoUpdater.on("update-not-available", () => {
    broadcast({ state: "not-available" });
  });

  autoUpdater.on("download-progress", (progress: ProgressInfo) => {
    broadcast({
      state: "downloading",
      percent: Math.max(0, Math.min(100, progress.percent)),
    });
  });

  autoUpdater.on("update-downloaded", (event: UpdateDownloadedEvent) => {
    broadcast({
      state: "ready",
      version: event.version,
    });
  });

  autoUpdater.on("error", (error: Error) => {
    logger.error("App updater error:", error);
    broadcast({
      state: "error",
      message: error.message || "Update check failed",
    });
  });
}

function schedulePolling(pollIntervalMs: number): void {
  pollTimer = setInterval(() => {
    void checkForAppUpdate();
  }, pollIntervalMs);
}

export function registerAppUpdater(deps: AppUpdaterDeps): void {
  activeDeps = deps;

  if (!deps.isPackaged) {
    logger.info("App updater skipped (unpackaged / development build)");
    broadcast({ state: "idle" });
    return;
  }

  wireAutoUpdaterEvents(deps);
  void checkForAppUpdate();
  schedulePolling(deps.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS);
}

export async function checkForAppUpdate(): Promise<{
  success: boolean;
  error?: string;
}> {
  if (activeDeps === null) {
    return { success: false, error: "Updater not initialized" };
  }
  if (!activeDeps.isPackaged) {
    return { success: true };
  }
  if (checkInFlight || !canStartAppUpdateCheck(lastStatus.state)) {
    return { success: true };
  }

  checkInFlight = true;
  try {
    await activeDeps.autoUpdater.checkForUpdates();
    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to check for updates";
    broadcast({ state: "error", message });
    return { success: false, error: message };
  } finally {
    checkInFlight = false;
  }
}

export function installAppUpdate(): {
  success: boolean;
  error?: string;
} {
  if (activeDeps === null) {
    return { success: false, error: "Updater not initialized" };
  }
  if (!activeDeps.isPackaged) {
    return {
      success: false,
      error: "Updates are only available in packaged builds",
    };
  }
  if (lastStatus.state !== "ready") {
    return { success: false, error: "No update ready to install" };
  }

  try {
    // isSilent=true, isForceRunAfter=true — Discord-style silent apply
    activeDeps.autoUpdater.quitAndInstall(true, true);
    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to install update";
    broadcast({ state: "error", message });
    return { success: false, error: message };
  }
}
