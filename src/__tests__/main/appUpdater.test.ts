import type { BrowserWindow } from "electron";
import type { AppUpdater as ElectronAppUpdater } from "electron-updater";

import {
  DEFAULT_INITIAL_CHECK_DELAY_MS,
  DEFAULT_POLL_INTERVAL_MS,
  canStartAppUpdateCheck,
  checkForAppUpdate,
  getLastAppUpdateStatus,
  installAppUpdate,
  registerAppUpdater,
  resetAppUpdaterForTests,
} from "../../main/appUpdater";

type ListenerMap = Map<string, Array<(...args: unknown[]) => void>>;

function createMockAutoUpdater(): {
  autoUpdater: ElectronAppUpdater;
  checkForUpdates: jest.Mock;
  quitAndInstall: jest.Mock;
  emit: (event: string, ...args: unknown[]) => void;
} {
  const listeners: ListenerMap = new Map();
  const checkForUpdates = jest.fn().mockResolvedValue(null);
  const quitAndInstall = jest.fn();
  const autoUpdater = {
    autoDownload: false,
    autoInstallOnAppQuit: false,
    logger: null,
    checkForUpdates,
    downloadUpdate: jest.fn().mockResolvedValue(null),
    quitAndInstall,
    on: jest.fn((event: string, listener: (...args: unknown[]) => void) => {
      const list = listeners.get(event) ?? [];
      list.push(listener);
      listeners.set(event, list);
      return autoUpdater;
    }),
  } as unknown as ElectronAppUpdater;

  return {
    autoUpdater,
    checkForUpdates,
    quitAndInstall,
    emit: (event: string, ...args: unknown[]) => {
      for (const listener of listeners.get(event) ?? []) {
        listener(...args);
      }
    },
  };
}

describe("scheduling constants", () => {
  it("polls every 4 hours and delays the first check by 8 seconds", () => {
    expect(DEFAULT_POLL_INTERVAL_MS).toBe(14_400_000);
    expect(DEFAULT_INITIAL_CHECK_DELAY_MS).toBe(8_000);
  });
});

describe("canStartAppUpdateCheck", () => {
  it("allows idle, not-available, and error; blocks busy/ready states", () => {
    expect(canStartAppUpdateCheck("idle")).toBe(true);
    expect(canStartAppUpdateCheck("not-available")).toBe(true);
    expect(canStartAppUpdateCheck("error")).toBe(true);
    expect(canStartAppUpdateCheck("checking")).toBe(false);
    expect(canStartAppUpdateCheck("available")).toBe(false);
    expect(canStartAppUpdateCheck("downloading")).toBe(false);
    expect(canStartAppUpdateCheck("ready")).toBe(false);
  });
});

describe("appUpdater", () => {
  let sendMock: jest.Mock;
  let getMainWindow: jest.Mock;
  let mock: ReturnType<typeof createMockAutoUpdater>;

  beforeEach(() => {
    resetAppUpdaterForTests();
    jest.useFakeTimers();
    sendMock = jest.fn();
    getMainWindow = jest.fn(
      () =>
        ({
          isDestroyed: () => false,
          webContents: { send: sendMock },
        }) as unknown as BrowserWindow
    );
    mock = createMockAutoUpdater();
  });

  afterEach(() => {
    resetAppUpdaterForTests();
    jest.useRealTimers();
  });

  it("exposes an 8s default initial check delay", () => {
    expect(DEFAULT_INITIAL_CHECK_DELAY_MS).toBe(8_000);
  });

  it("skips update checks when unpackaged and reports disabled", async () => {
    registerAppUpdater({
      autoUpdater: mock.autoUpdater,
      getMainWindow,
      isPackaged: false,
      currentVersion: "1.0.0",
    });

    await expect(checkForAppUpdate()).resolves.toEqual({
      outcome: "disabled",
    });
    expect(mock.checkForUpdates).not.toHaveBeenCalled();
    expect(getLastAppUpdateStatus()).toEqual({ state: "idle" });

    await jest.advanceTimersByTimeAsync(
      DEFAULT_INITIAL_CHECK_DELAY_MS + DEFAULT_POLL_INTERVAL_MS
    );
    expect(mock.checkForUpdates).not.toHaveBeenCalled();
  });

  it("honors DISABLE_AUTO_UPDATE=1 even for packaged builds", async () => {
    registerAppUpdater({
      autoUpdater: mock.autoUpdater,
      getMainWindow,
      isPackaged: true,
      currentVersion: "1.0.0",
      env: { DISABLE_AUTO_UPDATE: "1" },
    });

    await expect(checkForAppUpdate()).resolves.toEqual({
      outcome: "disabled",
    });
    expect(getLastAppUpdateStatus()).toEqual({ state: "idle" });

    await jest.advanceTimersByTimeAsync(
      DEFAULT_INITIAL_CHECK_DELAY_MS + DEFAULT_POLL_INTERVAL_MS
    );
    expect(mock.checkForUpdates).not.toHaveBeenCalled();
  });

  it("delays the first check, then polls on the injectable interval", async () => {
    const initialCheckDelayMs = 5_000;
    const pollIntervalMs = 60_000;
    registerAppUpdater({
      autoUpdater: mock.autoUpdater,
      getMainWindow,
      isPackaged: true,
      currentVersion: "1.0.0",
      initialCheckDelayMs,
      pollIntervalMs,
    });

    expect(mock.checkForUpdates).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(initialCheckDelayMs - 1);
    expect(mock.checkForUpdates).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(1);
    expect(mock.checkForUpdates).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(pollIntervalMs);
    expect(mock.checkForUpdates).toHaveBeenCalledTimes(2);

    await jest.advanceTimersByTimeAsync(pollIntervalMs);
    expect(mock.checkForUpdates).toHaveBeenCalledTimes(3);
  });

  it("reports busy instead of a silent success while a check is in flight", async () => {
    let resolveCheck: (() => void) | undefined;
    mock.checkForUpdates.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCheck = () => resolve(null);
        })
    );

    registerAppUpdater({
      autoUpdater: mock.autoUpdater,
      getMainWindow,
      isPackaged: true,
      currentVersion: "1.0.0",
      initialCheckDelayMs: 1_000,
      pollIntervalMs: 60_000,
    });
    await jest.advanceTimersByTimeAsync(1_000);
    expect(mock.checkForUpdates).toHaveBeenCalledTimes(1);

    await expect(checkForAppUpdate()).resolves.toEqual({ outcome: "busy" });
    expect(mock.checkForUpdates).toHaveBeenCalledTimes(1);

    resolveCheck?.();
  });

  it("reports busy with a ready message after an update is downloaded", async () => {
    registerAppUpdater({
      autoUpdater: mock.autoUpdater,
      getMainWindow,
      isPackaged: true,
      currentVersion: "1.0.0",
      initialCheckDelayMs: 1_000,
      pollIntervalMs: 60_000,
    });
    await jest.advanceTimersByTimeAsync(1_000);
    expect(mock.checkForUpdates).toHaveBeenCalledTimes(1);

    mock.emit("update-downloaded", { version: "1.0.1" });
    await expect(checkForAppUpdate()).resolves.toEqual({
      outcome: "busy",
      message: "An update is ready to install.",
    });
    expect(mock.checkForUpdates).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(60_000);
    expect(mock.checkForUpdates).toHaveBeenCalledTimes(1);
  });

  it("reports busy with a downloading message while an update downloads", async () => {
    registerAppUpdater({
      autoUpdater: mock.autoUpdater,
      getMainWindow,
      isPackaged: true,
      currentVersion: "1.0.0",
      initialCheckDelayMs: 1_000,
      pollIntervalMs: 60_000,
    });
    await jest.advanceTimersByTimeAsync(1_000);

    mock.emit("download-progress", { percent: 10 });
    await expect(checkForAppUpdate()).resolves.toEqual({
      outcome: "busy",
      message: "An update is already downloading.",
    });
  });

  it("returns update-available with the new version from a manual check", async () => {
    registerAppUpdater({
      autoUpdater: mock.autoUpdater,
      getMainWindow,
      isPackaged: true,
      currentVersion: "1.0.0",
      initialCheckDelayMs: 1_000,
      pollIntervalMs: 60_000,
    });
    await jest.advanceTimersByTimeAsync(1_000);
    mock.emit("update-not-available", { version: "1.0.0" });

    mock.checkForUpdates.mockResolvedValueOnce({
      isUpdateAvailable: true,
      updateInfo: { version: "1.0.9" },
    });
    await expect(checkForAppUpdate()).resolves.toEqual({
      outcome: "update-available",
      version: "1.0.9",
    });
  });

  it("returns up-to-date when no newer version exists", async () => {
    registerAppUpdater({
      autoUpdater: mock.autoUpdater,
      getMainWindow,
      isPackaged: true,
      currentVersion: "1.0.0",
      initialCheckDelayMs: 1_000,
      pollIntervalMs: 60_000,
    });
    await jest.advanceTimersByTimeAsync(1_000);
    mock.emit("update-not-available", { version: "1.0.0" });

    mock.checkForUpdates.mockResolvedValueOnce({
      isUpdateAvailable: false,
      updateInfo: { version: "1.0.0" },
    });
    await expect(checkForAppUpdate()).resolves.toEqual({
      outcome: "up-to-date",
    });
  });

  it("returns an error outcome when the provider gives no response", async () => {
    registerAppUpdater({
      autoUpdater: mock.autoUpdater,
      getMainWindow,
      isPackaged: true,
      currentVersion: "1.0.0",
      initialCheckDelayMs: 1_000,
      pollIntervalMs: 60_000,
    });
    await jest.advanceTimersByTimeAsync(1_000);
    mock.emit("update-not-available", { version: "1.0.0" });

    mock.checkForUpdates.mockResolvedValueOnce(null);
    await expect(checkForAppUpdate()).resolves.toEqual({
      outcome: "error",
      message: "No update response from provider",
    });
  });

  it("broadcasts available and ready statuses for packaged builds", async () => {
    registerAppUpdater({
      autoUpdater: mock.autoUpdater,
      getMainWindow,
      isPackaged: true,
      currentVersion: "1.0.0",
      initialCheckDelayMs: 1_000,
    });
    await jest.advanceTimersByTimeAsync(1_000);
    expect(mock.checkForUpdates).toHaveBeenCalled();

    mock.emit("update-available", { version: "1.0.1" });
    expect(getLastAppUpdateStatus()).toEqual({
      state: "available",
      version: "1.0.1",
      currentVersion: "1.0.0",
    });
    expect(sendMock).toHaveBeenCalledWith("app-update-status", {
      state: "available",
      version: "1.0.1",
      currentVersion: "1.0.0",
    });

    mock.emit("download-progress", { percent: 42.5 });
    expect(getLastAppUpdateStatus()).toEqual({
      state: "downloading",
      percent: 42.5,
    });

    mock.emit("update-downloaded", { version: "1.0.1" });
    expect(getLastAppUpdateStatus()).toEqual({
      state: "ready",
      version: "1.0.1",
    });

    expect(installAppUpdate()).toEqual({ success: true });
    expect(mock.quitAndInstall).toHaveBeenCalledWith(true, true);
  });

  it("broadcasts not-available when there is no update", async () => {
    registerAppUpdater({
      autoUpdater: mock.autoUpdater,
      getMainWindow,
      isPackaged: true,
      currentVersion: "1.0.0",
      initialCheckDelayMs: 1_000,
    });
    await jest.advanceTimersByTimeAsync(1_000);

    mock.emit("update-not-available", { version: "1.0.0" });
    expect(getLastAppUpdateStatus()).toEqual({ state: "not-available" });
  });

  it("broadcasts errors from failed checks and updater events", async () => {
    registerAppUpdater({
      autoUpdater: mock.autoUpdater,
      getMainWindow,
      isPackaged: true,
      currentVersion: "1.0.0",
      initialCheckDelayMs: 1_000,
    });
    await jest.advanceTimersByTimeAsync(1_000);
    mock.emit("update-not-available", { version: "1.0.0" });

    mock.checkForUpdates.mockRejectedValueOnce(new Error("network down"));
    await expect(checkForAppUpdate()).resolves.toEqual({
      outcome: "error",
      message: "network down",
    });
    expect(getLastAppUpdateStatus()).toEqual({
      state: "error",
      message: "network down",
    });

    mock.emit("error", new Error("download failed"));
    expect(getLastAppUpdateStatus()).toEqual({
      state: "error",
      message: "download failed",
    });
  });

  it("rejects install when no update is ready", () => {
    registerAppUpdater({
      autoUpdater: mock.autoUpdater,
      getMainWindow,
      isPackaged: true,
      currentVersion: "1.0.0",
      initialCheckDelayMs: 1_000,
    });

    expect(installAppUpdate()).toEqual({
      success: false,
      error: "No update ready to install",
    });
  });

  it("returns an error outcome before the updater is registered", async () => {
    await expect(checkForAppUpdate()).resolves.toEqual({
      outcome: "error",
      message: "Updater not initialized",
    });
  });
});
