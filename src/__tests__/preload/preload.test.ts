import type { ElectronAPI } from "../../types/ipc";
import {
  ALLOWED_CHANNELS,
  invokeIpc,
  isAllowedChannel,
} from "../../preload/preload";

const mockIpcInvoke = jest.fn();

jest.mock("electron", () => ({
  contextBridge: {
    exposeInMainWorld: jest.fn(),
  },
  ipcRenderer: {
    invoke: (...args: unknown[]): unknown => mockIpcInvoke(...args),
    on: jest.fn(),
    removeListener: jest.fn(),
  },
}));

interface ElectronModuleMock {
  contextBridge: { exposeInMainWorld: jest.Mock };
}

function getExposeMock(): jest.Mock {
  const electronMock: ElectronModuleMock = jest.requireMock("electron");
  return electronMock.contextBridge.exposeInMainWorld;
}

function getExposedApi(): ElectronAPI {
  const exposeMock = getExposeMock();
  expect(exposeMock).toHaveBeenCalledWith("electron", expect.any(Object));
  const calls = exposeMock.mock.calls as [string, ElectronAPI][];
  return calls[0][1];
}

describe("Preload IPC bridge", () => {
  beforeEach(() => {
    mockIpcInvoke.mockReset();
    mockIpcInvoke.mockResolvedValue({ success: true });
  });

  describe("channel whitelist", () => {
    it("lists every channel registered in the main process", () => {
      const registeredChannels = [
        "get-app-version",
        "check-diagnostics",
        "get-steam-paths",
        "get-steam-servers",
        "run-server",
        "stop-server",
        "auto-update-server",
        "backup-server-save",
        "select-backup-folder",
        "get-server-config",
        "get-server-output",
        "open-file-default",
        "save-server-config",
        "get-settings",
        "save-settings",
        "app-update-check",
        "app-update-install",
        "window-minimize",
        "window-maximize-toggle",
        "window-close",
      ];

      expect([...ALLOWED_CHANNELS].sort()).toEqual(
        [...registeredChannels].sort()
      );
    });

    it("accepts allowed channels and rejects unknown ones", () => {
      expect(isAllowedChannel("get-steam-servers")).toBe(true);
      expect(isAllowedChannel("window-close")).toBe(true);
      expect(isAllowedChannel("evil-channel")).toBe(false);
      expect(isAllowedChannel("")).toBe(false);
    });

    it("invokes allowed channels through ipcRenderer", async () => {
      mockIpcInvoke.mockResolvedValue(["/opt/steam"]);

      const result = await invokeIpc("get-steam-paths");

      expect(mockIpcInvoke).toHaveBeenCalledWith("get-steam-paths");
      expect(result).toEqual(["/opt/steam"]);
    });

    it("throws on disallowed channels without touching ipcRenderer", async () => {
      // Bypass compile-time channel checking to exercise the runtime guard
      const unsafeInvoke = invokeIpc as unknown as (
        channel: string
      ) => Promise<unknown>;

      await expect(unsafeInvoke("not-a-real-channel")).rejects.toThrow(
        /not-a-real-channel/
      );

      expect(mockIpcInvoke).not.toHaveBeenCalled();
    });
  });

  describe("exposed API", () => {
    it("exposes the electron API exactly once via the context bridge", () => {
      const exposeMock = getExposeMock();
      expect(exposeMock).toHaveBeenCalledTimes(1);
      const calls = exposeMock.mock.calls as [string, ElectronAPI][];
      expect(calls[0][0]).toBe("electron");
    });

    it("does not expose a generic invoke/send/on surface", () => {
      const api = getExposedApi() as unknown as Record<string, unknown>;

      expect(api.ipcRenderer).toBeUndefined();
      expect(api.invoke).toBeUndefined();
      expect(api.send).toBeUndefined();
      expect(api.on).toBeUndefined();
      expect(api.once).toBeUndefined();
    });

    it("invokes get-app-version for getAppVersion", async () => {
      mockIpcInvoke.mockResolvedValue("1.0.11");
      await expect(getExposedApi().getAppVersion()).resolves.toBe("1.0.11");
      expect(mockIpcInvoke).toHaveBeenCalledWith("get-app-version");
    });

    it("invokes check-diagnostics for checkDiagnostics", async () => {
      mockIpcInvoke.mockResolvedValue({ platform: "linux" });
      await expect(getExposedApi().checkDiagnostics()).resolves.toEqual({
        platform: "linux",
      });
      expect(mockIpcInvoke).toHaveBeenCalledWith("check-diagnostics");
    });

    it("invokes get-steam-paths for getSteamPaths", async () => {
      mockIpcInvoke.mockResolvedValue(["/opt/steam"]);
      await expect(getExposedApi().getSteamPaths()).resolves.toEqual([
        "/opt/steam",
      ]);
      expect(mockIpcInvoke).toHaveBeenCalledWith("get-steam-paths");
    });

    it("invokes get-steam-servers with the optional path", async () => {
      mockIpcInvoke.mockResolvedValue({ success: true, servers: [] });

      await getExposedApi().getSteamServers("/opt/steam");
      expect(mockIpcInvoke).toHaveBeenCalledWith(
        "get-steam-servers",
        "/opt/steam"
      );

      await getExposedApi().getSteamServers();
      expect(mockIpcInvoke).toHaveBeenLastCalledWith(
        "get-steam-servers",
        undefined
      );
    });

    it("invokes run-server with appId and installPath", async () => {
      await getExposedApi().runServer(1396110, "/steam/valheim");
      expect(mockIpcInvoke).toHaveBeenCalledWith(
        "run-server",
        1396110,
        "/steam/valheim"
      );
    });

    it("invokes stop-server with appId and installPath", async () => {
      await getExposedApi().stopServer(1396110, "/steam/valheim");
      expect(mockIpcInvoke).toHaveBeenCalledWith(
        "stop-server",
        1396110,
        "/steam/valheim"
      );
    });

    it("invokes auto-update-server with appId, installPath and steamPath", async () => {
      await getExposedApi().autoUpdateServer(
        1396110,
        "/steam/valheim",
        "/opt/steam"
      );
      expect(mockIpcInvoke).toHaveBeenCalledWith(
        "auto-update-server",
        1396110,
        "/steam/valheim",
        "/opt/steam"
      );
    });

    it("invokes backup-server-save with backup path", async () => {
      await getExposedApi().backupServerSave(
        1396110,
        "/steam/valheim",
        "/backups"
      );
      expect(mockIpcInvoke).toHaveBeenCalledWith(
        "backup-server-save",
        1396110,
        "/steam/valheim",
        "/backups"
      );
    });

    it("invokes select-backup-folder for selectBackupFolder", async () => {
      mockIpcInvoke.mockResolvedValue({ success: true, path: "/backups" });
      await expect(getExposedApi().selectBackupFolder()).resolves.toEqual({
        success: true,
        path: "/backups",
      });
      expect(mockIpcInvoke).toHaveBeenCalledWith("select-backup-folder");
    });

    it("invokes get-server-config for getServerConfig", async () => {
      await getExposedApi().getServerConfig(1396110, "/steam/valheim");
      expect(mockIpcInvoke).toHaveBeenCalledWith(
        "get-server-config",
        1396110,
        "/steam/valheim"
      );
    });

    it("invokes get-server-output for getServerOutput", async () => {
      mockIpcInvoke.mockResolvedValue("boot ok\n");
      await expect(getExposedApi().getServerOutput(1396110)).resolves.toBe(
        "boot ok\n"
      );
      expect(mockIpcInvoke).toHaveBeenCalledWith("get-server-output", 1396110);
    });

    it("invokes open-file-default for openFileDefault", async () => {
      await getExposedApi().openFileDefault("/steam/valheim/config.ini");
      expect(mockIpcInvoke).toHaveBeenCalledWith(
        "open-file-default",
        "/steam/valheim/config.ini"
      );
    });

    it("invokes save-server-config with content and format", async () => {
      const content = { ServerSettings: { MaxPlayers: 10 } };
      await getExposedApi().saveServerConfig(
        1396110,
        "/steam/valheim",
        content,
        "ini"
      );
      expect(mockIpcInvoke).toHaveBeenCalledWith(
        "save-server-config",
        1396110,
        "/steam/valheim",
        content,
        "ini"
      );
    });

    it("invokes get-settings for getSettings", async () => {
      mockIpcInvoke.mockResolvedValue({
        success: true,
        settings: { servers: {} },
      });
      await expect(getExposedApi().getSettings()).resolves.toEqual({
        success: true,
        settings: { servers: {} },
      });
      expect(mockIpcInvoke).toHaveBeenCalledWith("get-settings");
    });

    it("invokes save-settings with the settings object", async () => {
      const settings = {
        selectedSteamPath: "/opt/steam",
        servers: {
          "1396110": { autoRestart: true, autoUpdate: false },
        },
      };
      await getExposedApi().saveSettings(settings);
      expect(mockIpcInvoke).toHaveBeenCalledWith("save-settings", settings);
    });

    it("invokes app-update-check and app-update-install", async () => {
      await getExposedApi().checkForAppUpdate();
      expect(mockIpcInvoke).toHaveBeenCalledWith("app-update-check");

      await getExposedApi().installAppUpdate();
      expect(mockIpcInvoke).toHaveBeenCalledWith("app-update-install");
    });

    it("exposes typed window controls hitting the window-* channels", async () => {
      const { windowControls } = getExposedApi();

      await windowControls.minimize();
      expect(mockIpcInvoke).toHaveBeenCalledWith("window-minimize");

      mockIpcInvoke.mockResolvedValue({ success: true, maximized: true });
      await expect(windowControls.toggleMaximize()).resolves.toEqual({
        success: true,
        maximized: true,
      });
      expect(mockIpcInvoke).toHaveBeenCalledWith("window-maximize-toggle");

      await windowControls.close();
      expect(mockIpcInvoke).toHaveBeenCalledWith("window-close");
    });
  });
});
