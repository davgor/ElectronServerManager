import { act, renderHook, waitFor } from "@testing-library/react";

import { useServerBackups } from "../../renderer/hooks/useServerBackups";
import type {
  ElectronAPI,
  ServerPersistedSettings,
  SteamServer,
} from "../../types/ipc";

const mockBackupServerSave = jest.fn();
const mockSelectBackupFolder = jest.fn();

const mockElectronApi = {
  backupServerSave: mockBackupServerSave,
  selectBackupFolder: mockSelectBackupFolder,
} as unknown as ElectronAPI;

Object.defineProperty(window, "electron", {
  value: mockElectronApi,
  writable: true,
});

const runningServer: SteamServer = {
  name: "Valheim Server",
  appId: 1396110,
  installPath: "/steam/valheim",
  isRunning: true,
};

function serverSettings(
  patch: Partial<ServerPersistedSettings>
): Record<string, ServerPersistedSettings> {
  return {
    [String(runningServer.appId)]: {
      autoRestart: false,
      autoUpdate: false,
      ...patch,
    },
  };
}

describe("useServerBackups", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockBackupServerSave.mockResolvedValue({
      success: true,
      backupPath: "/backups/valheim.zip",
    });
    mockSelectBackupFolder.mockResolvedValue({
      success: true,
      path: "/backups",
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("reports an error when backing up without a configured location", () => {
    const onError = jest.fn();
    const { result } = renderHook(() =>
      useServerBackups({
        servers: [runningServer],
        serversSettings: {},
        setBackupPath: jest.fn(),
        onError,
      })
    );

    act(() => {
      result.current.backupNow(runningServer.appId, runningServer.installPath);
    });

    expect(onError).toHaveBeenCalledWith("Please set a backup location first");
    expect(mockBackupServerSave).not.toHaveBeenCalled();
  });

  it("backs up on demand and records the last backup time", async () => {
    const { result } = renderHook(() =>
      useServerBackups({
        servers: [runningServer],
        serversSettings: serverSettings({ backupPath: "/backups" }),
        setBackupPath: jest.fn(),
        onError: jest.fn(),
      })
    );

    act(() => {
      result.current.backupNow(runningServer.appId, runningServer.installPath);
    });

    await waitFor(() => {
      expect(mockBackupServerSave).toHaveBeenCalledWith(
        runningServer.appId,
        runningServer.installPath,
        "/backups"
      );
      expect(result.current.lastBackups[runningServer.appId]).toEqual(
        expect.any(String)
      );
    });
  });

  it("surfaces backup failures through onError", async () => {
    mockBackupServerSave.mockResolvedValue({
      success: false,
      error: "Disk full",
    });
    const onError = jest.fn();
    const { result } = renderHook(() =>
      useServerBackups({
        servers: [runningServer],
        serversSettings: serverSettings({ backupPath: "/backups" }),
        setBackupPath: jest.fn(),
        onError,
      })
    );

    act(() => {
      result.current.backupNow(runningServer.appId, runningServer.installPath);
    });

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith("Disk full");
    });
  });

  it("stores the chosen backup folder via setBackupPath", async () => {
    const setBackupPath = jest.fn();
    const { result } = renderHook(() =>
      useServerBackups({
        servers: [runningServer],
        serversSettings: {},
        setBackupPath,
        onError: jest.fn(),
      })
    );

    act(() => {
      result.current.selectBackupFolder(runningServer.appId);
    });

    await waitFor(() => {
      expect(setBackupPath).toHaveBeenCalledWith(
        runningServer.appId,
        "/backups"
      );
    });
  });

  it("surfaces folder selection errors through onError", async () => {
    mockSelectBackupFolder.mockResolvedValue({
      success: false,
      path: null,
      error: "Dialog unavailable",
    });
    const onError = jest.fn();
    const { result } = renderHook(() =>
      useServerBackups({
        servers: [runningServer],
        serversSettings: {},
        setBackupPath: jest.fn(),
        onError,
      })
    );

    act(() => {
      result.current.selectBackupFolder(runningServer.appId);
    });

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith("Dialog unavailable");
    });
  });

  it("auto-backs up running servers on their configured interval", async () => {
    jest.useFakeTimers();

    renderHook(() =>
      useServerBackups({
        servers: [runningServer],
        serversSettings: serverSettings({
          backupPath: "/backups",
          backupIntervalSeconds: 60,
        }),
        setBackupPath: jest.fn(),
        onError: jest.fn(),
      })
    );

    expect(mockBackupServerSave).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(60_000);
      await Promise.resolve();
    });

    expect(mockBackupServerSave).toHaveBeenCalledWith(
      runningServer.appId,
      runningServer.installPath,
      "/backups"
    );
  });

  it("does not auto-backup stopped servers or a disabled interval", async () => {
    jest.useFakeTimers();

    const stoppedServer: SteamServer = { ...runningServer, isRunning: false };
    const disabledServer: SteamServer = {
      name: "Ark Server",
      appId: 376030,
      installPath: "/steam/ark",
      isRunning: true,
    };

    renderHook(() =>
      useServerBackups({
        servers: [stoppedServer, disabledServer],
        serversSettings: {
          [String(stoppedServer.appId)]: {
            autoRestart: false,
            autoUpdate: false,
            backupPath: "/backups",
            backupIntervalSeconds: 60,
          },
          [String(disabledServer.appId)]: {
            autoRestart: false,
            autoUpdate: false,
            backupPath: "/backups",
            backupIntervalSeconds: 0,
          },
        },
        setBackupPath: jest.fn(),
        onError: jest.fn(),
      })
    );

    await act(async () => {
      jest.advanceTimersByTime(600_000);
      await Promise.resolve();
    });

    expect(mockBackupServerSave).not.toHaveBeenCalled();
  });
});
