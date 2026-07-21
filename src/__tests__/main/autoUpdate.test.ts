import { getServerBuildId } from "../../main/steamDetection";
import { startServer, stopServer } from "../../main/serverProcess";
import {
  fetchRemoteAppBuildId,
  resolveSteamCmdPath,
  runSteamCmdUpdate,
} from "../../main/steamCmd";
import {
  getPalworldRestStatus,
  invokePalworldRest,
} from "../../main/palworldRestIpc";
import { PALWORLD_APP_ID } from "../../types/ipc";
import {
  autoUpdateServer,
  resetAutoUpdateForTests,
  UPDATE_REBOOT_WARN_MESSAGE,
} from "../../main/autoUpdate";

jest.mock("../../main/steamDetection", () => ({
  ...jest.requireActual<typeof import("../../main/steamDetection")>(
    "../../main/steamDetection"
  ),
  getServerBuildId: jest.fn(),
}));

jest.mock("../../main/serverProcess", () => ({
  ...jest.requireActual<typeof import("../../main/serverProcess")>(
    "../../main/serverProcess"
  ),
  startServer: jest.fn(),
  stopServer: jest.fn(),
}));

jest.mock("../../main/steamCmd", () => ({
  resolveSteamCmdPath: jest.fn(),
  fetchRemoteAppBuildId: jest.fn(),
  runSteamCmdUpdate: jest.fn(),
}));

jest.mock("../../main/palworldRestIpc", () => ({
  getPalworldRestStatus: jest.fn(),
  invokePalworldRest: jest.fn(),
}));

const mockGetServerBuildId = jest.mocked(getServerBuildId);
const mockStartServer = jest.mocked(startServer);
const mockStopServer = jest.mocked(stopServer);
const mockResolveSteamCmdPath = jest.mocked(resolveSteamCmdPath);
const mockFetchRemoteAppBuildId = jest.mocked(fetchRemoteAppBuildId);
const mockRunSteamCmdUpdate = jest.mocked(runSteamCmdUpdate);
const mockGetPalworldRestStatus = jest.mocked(getPalworldRestStatus);
const mockInvokePalworldRest = jest.mocked(invokePalworldRest);

const APP_ID = 2278520;
const INSTALL_PATH = "/steam/common/EnshroudedServer";
const STEAM_PATH = "/steam/steamapps";
const PALWORLD_INSTALL = "/steam/common/PalServer";

const NO_POLL_DELAYS: number[] = [];

describe("autoUpdateServer", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    resetAutoUpdateForTests();
    mockResolveSteamCmdPath.mockReturnValue("/usr/bin/steamcmd");
    mockStopServer.mockReturnValue({ success: true });
    mockStartServer.mockResolvedValue({ success: true });
    mockRunSteamCmdUpdate.mockResolvedValue({ success: true });
    // Default: remote build differs so the disruptive update path can run.
    mockFetchRemoteAppBuildId.mockResolvedValue({
      success: true,
      buildId: "101",
    });
    mockGetPalworldRestStatus.mockResolvedValue({
      success: true,
      enabled: false,
      isPalworld: false,
    });
  });

  it("fails at validation for an unknown app id", async () => {
    const result = await autoUpdateServer(999999, INSTALL_PATH, STEAM_PATH, {
      buildIdPollDelaysMs: NO_POLL_DELAYS,
    });

    expect(result.success).toBe(false);
    expect(result.stage).toBe("validating");
    expect(result.updated).toBe(false);
    expect(mockStopServer).not.toHaveBeenCalled();
  });

  it("fails with a clear error before stopping when steamcmd is missing", async () => {
    mockResolveSteamCmdPath.mockReturnValue(null);

    const result = await autoUpdateServer(APP_ID, INSTALL_PATH, STEAM_PATH, {
      buildIdPollDelaysMs: NO_POLL_DELAYS,
    });

    expect(result.success).toBe(false);
    expect(result.stage).toBe("resolving-steamcmd");
    expect(result.error).toContain("steamcmd");
    expect(mockStopServer).not.toHaveBeenCalled();
    expect(mockRunSteamCmdUpdate).not.toHaveBeenCalled();
  });

  it("mentions the configured path when it does not exist", async () => {
    mockResolveSteamCmdPath.mockReturnValue(null);

    const result = await autoUpdateServer(APP_ID, INSTALL_PATH, STEAM_PATH, {
      steamCmdPath: "/custom/steamcmd.sh",
      buildIdPollDelaysMs: NO_POLL_DELAYS,
    });

    expect(result.success).toBe(false);
    expect(result.stage).toBe("resolving-steamcmd");
    expect(result.error).toContain("/custom/steamcmd.sh");
    expect(mockResolveSteamCmdPath).toHaveBeenCalledWith("/custom/steamcmd.sh");
  });

  it("returns no-update without stopping when local and remote buildids match", async () => {
    mockGetServerBuildId.mockResolvedValue("100");
    mockFetchRemoteAppBuildId.mockResolvedValue({
      success: true,
      buildId: "100",
    });

    const result = await autoUpdateServer(APP_ID, INSTALL_PATH, STEAM_PATH, {
      buildIdPollDelaysMs: NO_POLL_DELAYS,
    });

    expect(result.success).toBe(true);
    expect(result.stage).toBe("no-update");
    expect(result.updated).toBe(false);
    expect(result.previousBuildId).toBe("100");
    expect(result.newBuildId).toBe("100");
    expect(mockStopServer).not.toHaveBeenCalled();
    expect(mockStartServer).not.toHaveBeenCalled();
    expect(mockRunSteamCmdUpdate).not.toHaveBeenCalled();
  });

  it("fails at checking without stopping when remote buildid cannot be fetched", async () => {
    mockGetServerBuildId.mockResolvedValue("100");
    mockFetchRemoteAppBuildId.mockResolvedValue({
      success: false,
      error: "steamcmd timed out while checking app info",
    });

    const result = await autoUpdateServer(APP_ID, INSTALL_PATH, STEAM_PATH, {
      buildIdPollDelaysMs: NO_POLL_DELAYS,
    });

    expect(result.success).toBe(false);
    expect(result.stage).toBe("checking");
    expect(result.error).toContain("timed out");
    expect(mockStopServer).not.toHaveBeenCalled();
    expect(mockRunSteamCmdUpdate).not.toHaveBeenCalled();
  });

  it("fails at checking without stopping when local buildid cannot be read", async () => {
    mockGetServerBuildId.mockResolvedValue(null);

    const result = await autoUpdateServer(APP_ID, INSTALL_PATH, STEAM_PATH, {
      buildIdPollDelaysMs: NO_POLL_DELAYS,
    });

    expect(result.success).toBe(false);
    expect(result.stage).toBe("checking");
    expect(result.error).toMatch(/local buildid/i);
    expect(mockStopServer).not.toHaveBeenCalled();
    expect(mockFetchRemoteAppBuildId).not.toHaveBeenCalled();
    expect(mockRunSteamCmdUpdate).not.toHaveBeenCalled();
  });

  it("fails at the stopping stage when stop-server fails", async () => {
    mockGetServerBuildId.mockResolvedValue("100");
    mockStopServer.mockReturnValue({ success: false, error: "kill EPERM" });

    const result = await autoUpdateServer(APP_ID, INSTALL_PATH, STEAM_PATH, {
      buildIdPollDelaysMs: NO_POLL_DELAYS,
    });

    expect(result.success).toBe(false);
    expect(result.stage).toBe("stopping");
    expect(result.error).toContain("kill EPERM");
    expect(mockRunSteamCmdUpdate).not.toHaveBeenCalled();
  });

  it("passes installPath to steamcmd and fails at updating on steamcmd error after restart attempt", async () => {
    mockGetServerBuildId.mockResolvedValue("100");
    mockRunSteamCmdUpdate.mockResolvedValue({
      success: false,
      error: "steamcmd exited with exit code 8",
    });

    const result = await autoUpdateServer(APP_ID, INSTALL_PATH, STEAM_PATH, {
      buildIdPollDelaysMs: NO_POLL_DELAYS,
    });

    expect(mockRunSteamCmdUpdate).toHaveBeenCalledWith(
      "/usr/bin/steamcmd",
      APP_ID,
      INSTALL_PATH,
      expect.any(Object)
    );
    expect(mockStartServer).toHaveBeenCalledWith(APP_ID, INSTALL_PATH);
    expect(result.success).toBe(false);
    expect(result.stage).toBe("updating");
    expect(result.error).toContain("exit code 8");
  });

  it("keeps the update error when steamcmd fails and restart also fails", async () => {
    mockGetServerBuildId.mockResolvedValue("100");
    mockRunSteamCmdUpdate.mockResolvedValue({
      success: false,
      error: "steamcmd exited with exit code 8",
    });
    mockStartServer.mockResolvedValue({
      success: false,
      error: "bind failed",
    });

    const result = await autoUpdateServer(APP_ID, INSTALL_PATH, STEAM_PATH, {
      buildIdPollDelaysMs: NO_POLL_DELAYS,
    });

    expect(result.success).toBe(false);
    expect(result.stage).toBe("updating");
    expect(result.error).toContain("exit code 8");
    expect(result.error).toContain("left stopped");
    expect(result.error).toContain("bind failed");
  });

  it("stops and updates when remote buildid differs, then restarts on unchanged post-update buildid", async () => {
    mockGetServerBuildId.mockResolvedValue("100");
    mockFetchRemoteAppBuildId.mockResolvedValue({
      success: true,
      buildId: "101",
    });

    const result = await autoUpdateServer(APP_ID, INSTALL_PATH, STEAM_PATH, {
      buildIdPollDelaysMs: NO_POLL_DELAYS,
    });

    expect(mockStopServer).toHaveBeenCalledWith(APP_ID, INSTALL_PATH);
    expect(mockRunSteamCmdUpdate).toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.stage).toBe("no-update");
    expect(result.updated).toBe(false);
    expect(result.previousBuildId).toBe("100");
    expect(result.newBuildId).toBe("100");
    expect(mockStartServer).toHaveBeenCalledWith(APP_ID, INSTALL_PATH);
  });

  it("restarts and reports complete when the buildid changed", async () => {
    mockGetServerBuildId.mockResolvedValueOnce("100").mockResolvedValue("101");

    const result = await autoUpdateServer(APP_ID, INSTALL_PATH, STEAM_PATH, {
      buildIdPollDelaysMs: NO_POLL_DELAYS,
    });

    expect(result.success).toBe(true);
    expect(result.stage).toBe("complete");
    expect(result.updated).toBe(true);
    expect(result.previousBuildId).toBe("100");
    expect(result.newBuildId).toBe("101");
    expect(mockStopServer).toHaveBeenCalledWith(APP_ID, INSTALL_PATH);
    expect(mockStartServer).toHaveBeenCalledWith(APP_ID, INSTALL_PATH);
  });

  it("polls the buildid with backoff until it changes", async () => {
    mockGetServerBuildId
      .mockResolvedValueOnce("100") // before update
      .mockResolvedValueOnce("100") // first verify poll: unchanged
      .mockResolvedValue("101"); // second verify poll: changed

    const result = await autoUpdateServer(APP_ID, INSTALL_PATH, STEAM_PATH, {
      buildIdPollDelaysMs: [0, 0],
    });

    expect(result.stage).toBe("complete");
    expect(result.updated).toBe(true);
    // 1 pre-update read + 2 verify polls
    expect(mockGetServerBuildId).toHaveBeenCalledTimes(3);
  });

  it("fails at the restarting stage when the restart fails after an update", async () => {
    mockGetServerBuildId.mockResolvedValueOnce("100").mockResolvedValue("101");
    mockStartServer.mockResolvedValue({
      success: false,
      error: "Server process exited immediately",
    });

    const result = await autoUpdateServer(APP_ID, INSTALL_PATH, STEAM_PATH, {
      buildIdPollDelaysMs: NO_POLL_DELAYS,
    });

    expect(result.success).toBe(false);
    expect(result.stage).toBe("restarting");
    expect(result.updated).toBe(true);
    expect(result.error).toContain("exited immediately");
  });

  it("reports no-update and restarts when the buildid cannot be read after the update", async () => {
    mockGetServerBuildId.mockResolvedValueOnce("100").mockResolvedValue(null);

    const result = await autoUpdateServer(APP_ID, INSTALL_PATH, STEAM_PATH, {
      buildIdPollDelaysMs: NO_POLL_DELAYS,
    });

    expect(result.success).toBe(true);
    expect(result.stage).toBe("no-update");
    expect(result.updated).toBe(false);
    expect(mockStartServer).toHaveBeenCalledWith(APP_ID, INSTALL_PATH);
  });

  it("fails at restarting when no-update restart fails", async () => {
    mockGetServerBuildId.mockResolvedValue("100");
    mockStartServer.mockResolvedValue({
      success: false,
      error: "Server process exited immediately",
    });

    const result = await autoUpdateServer(APP_ID, INSTALL_PATH, STEAM_PATH, {
      buildIdPollDelaysMs: NO_POLL_DELAYS,
    });

    expect(result.success).toBe(false);
    expect(result.stage).toBe("restarting");
    expect(result.updated).toBe(false);
    expect(result.error).toContain("exited immediately");
  });

  it("skips announce and delay when Palworld REST is disabled", async () => {
    mockGetServerBuildId.mockResolvedValueOnce("100").mockResolvedValue("101");
    mockGetPalworldRestStatus.mockResolvedValue({
      success: true,
      enabled: false,
      isPalworld: true,
    });

    const result = await autoUpdateServer(
      PALWORLD_APP_ID,
      PALWORLD_INSTALL,
      STEAM_PATH,
      { buildIdPollDelaysMs: NO_POLL_DELAYS, warnBeforeUpdateMs: 60_000 }
    );

    expect(mockInvokePalworldRest).not.toHaveBeenCalled();
    expect(mockStopServer).toHaveBeenCalledWith(
      PALWORLD_APP_ID,
      PALWORLD_INSTALL
    );
    expect(result.stage).toBe("complete");
  });

  it("announces, waits, then stops and updates when Palworld REST is enabled", async () => {
    mockGetServerBuildId.mockResolvedValueOnce("100").mockResolvedValue("101");
    mockGetPalworldRestStatus.mockResolvedValue({
      success: true,
      enabled: true,
      isPalworld: true,
      port: 8212,
    });
    mockInvokePalworldRest.mockResolvedValue({ success: true, data: {} });

    const result = await autoUpdateServer(
      PALWORLD_APP_ID,
      PALWORLD_INSTALL,
      STEAM_PATH,
      { buildIdPollDelaysMs: NO_POLL_DELAYS, warnBeforeUpdateMs: 0 }
    );

    expect(mockInvokePalworldRest).toHaveBeenCalledWith(
      PALWORLD_APP_ID,
      PALWORLD_INSTALL,
      "POST",
      "announce",
      { message: UPDATE_REBOOT_WARN_MESSAGE }
    );
    expect(mockStopServer).toHaveBeenCalledWith(
      PALWORLD_APP_ID,
      PALWORLD_INSTALL
    );
    expect(mockRunSteamCmdUpdate).toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.stage).toBe("complete");
    expect(result.updated).toBe(true);
  });

  it("fails at notifying without stopping when announce fails", async () => {
    mockGetServerBuildId.mockResolvedValue("100");
    mockGetPalworldRestStatus.mockResolvedValue({
      success: true,
      enabled: true,
      isPalworld: true,
      port: 8212,
    });
    mockInvokePalworldRest.mockResolvedValue({
      success: false,
      error: "Palworld REST HTTP 401",
    });

    const result = await autoUpdateServer(
      PALWORLD_APP_ID,
      PALWORLD_INSTALL,
      STEAM_PATH,
      { buildIdPollDelaysMs: NO_POLL_DELAYS, warnBeforeUpdateMs: 0 }
    );

    expect(result.success).toBe(false);
    expect(result.stage).toBe("notifying");
    expect(result.error).toContain("401");
    expect(mockStopServer).not.toHaveBeenCalled();
    expect(mockRunSteamCmdUpdate).not.toHaveBeenCalled();
  });

  it("skips a concurrent auto-update while one is already in flight", async () => {
    mockGetServerBuildId.mockResolvedValueOnce("100").mockResolvedValue("101");
    mockGetPalworldRestStatus.mockResolvedValue({
      success: true,
      enabled: true,
      isPalworld: true,
      port: 8212,
    });

    let releaseAnnounce: (() => void) | undefined;
    mockInvokePalworldRest.mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseAnnounce = () => resolve({ success: true, data: {} });
        })
    );

    const first = autoUpdateServer(
      PALWORLD_APP_ID,
      PALWORLD_INSTALL,
      STEAM_PATH,
      { buildIdPollDelaysMs: NO_POLL_DELAYS, warnBeforeUpdateMs: 0 }
    );

    // Let the first call reach the announce await.
    await Promise.resolve();
    await Promise.resolve();

    const second = await autoUpdateServer(
      PALWORLD_APP_ID,
      PALWORLD_INSTALL,
      STEAM_PATH,
      { buildIdPollDelaysMs: NO_POLL_DELAYS, warnBeforeUpdateMs: 0 }
    );

    expect(second.success).toBe(true);
    expect(second.stage).toBe("no-update");
    expect(second.updated).toBe(false);

    releaseAnnounce?.();
    const firstResult = await first;
    expect(firstResult.stage).toBe("complete");
    expect(mockStopServer).toHaveBeenCalledTimes(1);
  });
});
