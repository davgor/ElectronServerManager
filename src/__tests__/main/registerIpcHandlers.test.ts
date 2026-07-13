/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/strict-boolean-expressions, @typescript-eslint/no-redundant-type-constituents */

const handleMock = jest.fn();

jest.mock("electron", () => ({
  app: { getVersion: jest.fn(() => "1.2.3") },
  ipcMain: {
    handle: (...args: unknown[]) => handleMock(...args),
  },
  dialog: {},
  BrowserWindow: jest.fn(),
}));

jest.mock("../../main/windowControls", () => ({
  registerWindowControlHandlers: jest.fn(),
}));

jest.mock("../../main/steamIpc", () => ({
  collectDiagnostics: jest.fn(),
  listSteamPaths: jest.fn(),
  fetchSteamServers: jest.fn(),
  openFileDefault: jest.fn(),
}));

jest.mock("../../main/serverProcess", () => ({
  startServer: jest.fn(),
  stopServer: jest.fn(),
}));

jest.mock("../../main/autoUpdate", () => ({
  autoUpdateServer: jest.fn(),
}));

jest.mock("../../main/serverConfig", () => ({
  getServerConfig: jest.fn(),
  saveServerConfig: jest.fn(),
}));

jest.mock("../../main/serverBackup", () => ({
  backupServerSaveHandler: jest.fn(),
  selectBackupFolder: jest.fn(),
}));

jest.mock("../../main/settingsStore", () => ({
  getSettings: jest.fn(() => ({ success: true, settings: { servers: {} } })),
  saveSettings: jest.fn(),
}));

jest.mock("../../main/serverOutputBuffer", () => ({
  getServerOutput: jest.fn(),
}));

jest.mock("../../main/appUpdater", () => ({
  checkForAppUpdate: jest.fn(),
  installAppUpdate: jest.fn(),
}));

jest.mock("../../main/palworldRestIpc", () => ({
  getPalworldRestStatus: jest.fn(),
  invokePalworldRest: jest.fn(),
}));

import { registerWindowControlHandlers } from "../../main/windowControls";
import { registerIpcHandlers } from "../../main/registerIpcHandlers";
import { startServer, stopServer } from "../../main/serverProcess";
import { fetchSteamServers } from "../../main/steamIpc";
import { getServerConfig, saveServerConfig } from "../../main/serverConfig";
import { checkForAppUpdate, installAppUpdate } from "../../main/appUpdater";
import {
  getPalworldRestStatus,
  invokePalworldRest,
} from "../../main/palworldRestIpc";

const mockStartServer = startServer as jest.Mock;
const mockStopServer = stopServer as jest.Mock;
const mockFetchSteamServers = fetchSteamServers as jest.Mock;
const mockGetServerConfig = getServerConfig as jest.Mock;
const mockSaveServerConfig = saveServerConfig as jest.Mock;
const mockCheckForAppUpdate = checkForAppUpdate as jest.Mock;
const mockInstallAppUpdate = installAppUpdate as jest.Mock;
const mockGetPalworldRestStatus = getPalworldRestStatus as jest.Mock;
const mockInvokePalworldRest = invokePalworldRest as jest.Mock;

function getHandler(channel: string): (...args: unknown[]) => unknown {
  const call = handleMock.mock.calls.find(
    (entry: unknown[]) => entry[0] === channel
  ) as [string, (...args: unknown[]) => unknown] | undefined;
  if (call === undefined) {
    throw new Error(`Handler not registered for ${channel}`);
  }
  return call[1];
}

describe("registerIpcHandlers", () => {
  beforeEach(() => {
    handleMock.mockReset();
    jest.clearAllMocks();
  });

  it("registers window controls and key server/config channels", () => {
    const getMainWindow = jest.fn(() => null);
    registerIpcHandlers({
      getMainWindow,
      dialogApi: { showOpenDialog: jest.fn() },
    });

    expect(registerWindowControlHandlers).toHaveBeenCalledWith(getMainWindow);
    for (const channel of [
      "run-server",
      "stop-server",
      "get-steam-servers",
      "get-server-config",
      "save-server-config",
      "get-app-version",
      "app-update-check",
      "app-update-install",
      "palworld-rest-status",
      "palworld-rest-request",
    ]) {
      expect(handleMock).toHaveBeenCalledWith(channel, expect.any(Function));
    }
  });

  it("delegates run/stop/get-steam-servers/get/save config to modules", async () => {
    registerIpcHandlers({
      getMainWindow: () => null,
      dialogApi: { showOpenDialog: jest.fn() },
    });

    mockStartServer.mockResolvedValue({ success: true });
    mockStopServer.mockResolvedValue({ success: true });
    mockFetchSteamServers.mockResolvedValue({ success: true, servers: [] });
    mockGetServerConfig.mockResolvedValue({
      success: true,
      content: {},
      format: "json",
    });
    mockSaveServerConfig.mockResolvedValue({ success: true });
    mockCheckForAppUpdate.mockResolvedValue({ success: true });
    mockInstallAppUpdate.mockResolvedValue({ success: true });
    mockGetPalworldRestStatus.mockResolvedValue({
      success: true,
      enabled: true,
      isPalworld: true,
      port: 8212,
    });
    mockInvokePalworldRest.mockResolvedValue({
      success: true,
      data: { version: "1" },
    });

    await expect(getHandler("run-server")({}, 1, "/path")).resolves.toEqual({
      success: true,
    });
    expect(mockStartServer).toHaveBeenCalledWith(1, "/path");

    await expect(getHandler("stop-server")({}, 1, "/path")).resolves.toEqual({
      success: true,
    });
    expect(mockStopServer).toHaveBeenCalledWith(1, "/path");

    await expect(
      getHandler("get-steam-servers")({}, "/steam")
    ).resolves.toEqual({
      success: true,
      servers: [],
    });
    expect(mockFetchSteamServers).toHaveBeenCalledWith("/steam");

    await expect(
      getHandler("get-server-config")({}, 1, "/path")
    ).resolves.toEqual({
      success: true,
      content: {},
      format: "json",
    });
    expect(mockGetServerConfig).toHaveBeenCalledWith(1, "/path");

    await expect(
      getHandler("save-server-config")({}, 1, "/path", { a: 1 }, "json")
    ).resolves.toEqual({ success: true });
    expect(mockSaveServerConfig).toHaveBeenCalledWith(
      1,
      "/path",
      { a: 1 },
      "json"
    );

    await expect(getHandler("app-update-check")()).resolves.toEqual({
      success: true,
    });
    expect(mockCheckForAppUpdate).toHaveBeenCalled();

    await expect(getHandler("app-update-install")()).resolves.toEqual({
      success: true,
    });
    expect(mockInstallAppUpdate).toHaveBeenCalled();

    await expect(
      getHandler("palworld-rest-status")({}, 1623730, "/pal")
    ).resolves.toEqual({
      success: true,
      enabled: true,
      isPalworld: true,
      port: 8212,
    });
    expect(mockGetPalworldRestStatus).toHaveBeenCalledWith(1623730, "/pal");

    await expect(
      getHandler("palworld-rest-request")({}, 1623730, "/pal", "GET", "info")
    ).resolves.toEqual({ success: true, data: { version: "1" } });
    expect(mockInvokePalworldRest).toHaveBeenCalledWith(
      1623730,
      "/pal",
      "GET",
      "info",
      undefined
    );
  });
});
