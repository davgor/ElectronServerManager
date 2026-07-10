import { getServerBuildId } from "../../main/steamDetection";
import { startServer, stopServer } from "../../main/serverProcess";
import { resolveSteamCmdPath, runSteamCmdUpdate } from "../../main/steamCmd";
import { autoUpdateServer } from "../../main/autoUpdate";

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
  runSteamCmdUpdate: jest.fn(),
}));

const mockGetServerBuildId = jest.mocked(getServerBuildId);
const mockStartServer = jest.mocked(startServer);
const mockStopServer = jest.mocked(stopServer);
const mockResolveSteamCmdPath = jest.mocked(resolveSteamCmdPath);
const mockRunSteamCmdUpdate = jest.mocked(runSteamCmdUpdate);

const APP_ID = 2278520;
const INSTALL_PATH = "/steam/common/EnshroudedServer";
const STEAM_PATH = "/steam/steamapps";

const NO_POLL_DELAYS: number[] = [];

describe("autoUpdateServer", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockResolveSteamCmdPath.mockReturnValue("/usr/bin/steamcmd");
    mockStopServer.mockReturnValue({ success: true });
    mockStartServer.mockResolvedValue({ success: true });
    mockRunSteamCmdUpdate.mockResolvedValue({ success: true });
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

  it("runs steamcmd for the app and fails at updating on steamcmd error", async () => {
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
      expect.any(Object)
    );
    expect(result.success).toBe(false);
    expect(result.stage).toBe("updating");
    expect(result.error).toContain("exit code 8");
    expect(mockStartServer).not.toHaveBeenCalled();
  });

  it("does not restart when the buildid is unchanged after steamcmd", async () => {
    mockGetServerBuildId.mockResolvedValue("100");

    const result = await autoUpdateServer(APP_ID, INSTALL_PATH, STEAM_PATH, {
      buildIdPollDelaysMs: NO_POLL_DELAYS,
    });

    expect(result.success).toBe(true);
    expect(result.stage).toBe("no-update");
    expect(result.updated).toBe(false);
    expect(result.previousBuildId).toBe("100");
    expect(result.newBuildId).toBe("100");
    expect(mockStartServer).not.toHaveBeenCalled();
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

  it("fails at the restarting stage when the restart fails", async () => {
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

  it("reports no-update when the buildid cannot be read after the update", async () => {
    mockGetServerBuildId.mockResolvedValueOnce("100").mockResolvedValue(null);

    const result = await autoUpdateServer(APP_ID, INSTALL_PATH, STEAM_PATH, {
      buildIdPollDelaysMs: NO_POLL_DELAYS,
    });

    expect(result.success).toBe(true);
    expect(result.stage).toBe("no-update");
    expect(result.updated).toBe(false);
    expect(mockStartServer).not.toHaveBeenCalled();
  });
});
