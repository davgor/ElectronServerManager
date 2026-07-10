import { renderHook, act, waitFor } from "@testing-library/react";

import type { AppSettings, ElectronAPI } from "../../types/ipc";
import { useServerSettings } from "../../renderer/hooks/useServerSettings";

interface ElectronSettingsMock {
  getSettings: jest.Mock;
  saveSettings: jest.Mock;
}

function installElectronMock(persisted: AppSettings): ElectronSettingsMock {
  const mock: ElectronSettingsMock = {
    getSettings: jest
      .fn()
      .mockResolvedValue({ success: true, settings: persisted }),
    saveSettings: jest.fn().mockResolvedValue({ success: true }),
  };
  Object.defineProperty(window, "electron", {
    value: mock as unknown as ElectronAPI,
    writable: true,
  });
  return mock;
}

describe("useServerSettings", () => {
  it("loads persisted settings on mount", async () => {
    const persisted: AppSettings = {
      selectedSteamPath: "/opt/steam",
      servers: {
        "1396110": { autoRestart: true, autoUpdate: false },
      },
    };
    const mock = installElectronMock(persisted);

    const { result } = renderHook(() => useServerSettings());

    expect(result.current.settingsLoaded).toBe(false);
    expect(result.current.settings).toEqual({ servers: {} });

    await waitFor(() => {
      expect(result.current.settingsLoaded).toBe(true);
    });

    expect(mock.getSettings).toHaveBeenCalledTimes(1);
    expect(result.current.settings).toEqual(persisted);
  });

  it("persists merged settings via saveSettings when setAutoRestart is called", async () => {
    const mock = installElectronMock({ servers: {} });

    const { result } = renderHook(() => useServerSettings());
    await waitFor(() => {
      expect(result.current.settingsLoaded).toBe(true);
    });

    act(() => {
      result.current.setAutoRestart(1396110, true);
    });

    const expected: AppSettings = {
      servers: {
        "1396110": { autoRestart: true, autoUpdate: false },
      },
    };
    expect(mock.saveSettings).toHaveBeenCalledWith(expected);
    expect(result.current.settings).toEqual(expected);
  });

  it("persists the selected Steam path via setSelectedSteamPath", async () => {
    const mock = installElectronMock({ servers: {} });

    const { result } = renderHook(() => useServerSettings());
    await waitFor(() => {
      expect(result.current.settingsLoaded).toBe(true);
    });

    act(() => {
      result.current.setSelectedSteamPath("/opt/steam");
    });

    const expected: AppSettings = {
      selectedSteamPath: "/opt/steam",
      servers: {},
    };
    expect(mock.saveSettings).toHaveBeenCalledWith(expected);
    expect(result.current.settings).toEqual(expected);
  });

  it("persists the steamcmd path via setSteamCmdPath", async () => {
    const mock = installElectronMock({ servers: {} });

    const { result } = renderHook(() => useServerSettings());
    await waitFor(() => {
      expect(result.current.settingsLoaded).toBe(true);
    });

    act(() => {
      result.current.setSteamCmdPath("/usr/bin/steamcmd");
    });

    const expected: AppSettings = {
      steamCmdPath: "/usr/bin/steamcmd",
      servers: {},
    };
    expect(mock.saveSettings).toHaveBeenCalledWith(expected);
    expect(result.current.settings).toEqual(expected);
  });

  it("preserves other servers' entries when updating one server", async () => {
    const persisted: AppSettings = {
      servers: {
        "2278520": {
          autoRestart: false,
          autoUpdate: true,
          backupPath: "/backups/enshrouded",
        },
      },
    };
    const mock = installElectronMock(persisted);

    const { result } = renderHook(() => useServerSettings());
    await waitFor(() => {
      expect(result.current.settingsLoaded).toBe(true);
    });

    act(() => {
      result.current.setAutoUpdate(1396110, true);
    });

    const expected: AppSettings = {
      servers: {
        "2278520": {
          autoRestart: false,
          autoUpdate: true,
          backupPath: "/backups/enshrouded",
        },
        "1396110": { autoRestart: false, autoUpdate: true },
      },
    };
    expect(mock.saveSettings).toHaveBeenCalledWith(expected);
    expect(result.current.settings).toEqual(expected);
  });
});
