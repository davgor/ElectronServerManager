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
import { getGameQuerySnapshot } from "../../main/gameQueryIpc";
import { getCapabilityRepository } from "../../main/catalog/capabilityRepository";
import { PALWORLD_APP_ID } from "../../types/ipc";
import type { GameQuerySnapshotResponse } from "../../types/ipc";
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

jest.mock("../../main/gameQueryIpc", () => ({
  getGameQuerySnapshot: jest.fn(),
}));

const mockGetServerBuildId = jest.mocked(getServerBuildId);
const mockStartServer = jest.mocked(startServer);
const mockStopServer = jest.mocked(stopServer);
const mockResolveSteamCmdPath = jest.mocked(resolveSteamCmdPath);
const mockFetchRemoteAppBuildId = jest.mocked(fetchRemoteAppBuildId);
const mockRunSteamCmdUpdate = jest.mocked(runSteamCmdUpdate);
const mockGetPalworldRestStatus = jest.mocked(getPalworldRestStatus);
const mockInvokePalworldRest = jest.mocked(invokePalworldRest);
const mockGetGameQuerySnapshot = jest.mocked(getGameQuerySnapshot);

function querySnapshot(players: number, bots = 0): GameQuerySnapshotResponse {
  return {
    success: true,
    host: "127.0.0.1",
    port: 15637,
    info: {
      serverName: "Shroud Squad",
      map: "Embervale",
      game: "Enshrouded",
      version: "1.0.0.0",
      players,
      maxPlayers: 16,
      bots,
      passwordProtected: false,
    },
    players: [],
  };
}

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
    // Default: the Enshrouded (APP_ID) query reports an empty server.
    mockGetGameQuerySnapshot.mockResolvedValue(querySnapshot(0));
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

  it("resolves the local buildid from the library that owns installPath", async () => {
    mockGetServerBuildId.mockResolvedValue("100");
    mockFetchRemoteAppBuildId.mockResolvedValue({
      success: true,
      buildId: "100",
    });

    await autoUpdateServer(APP_ID, INSTALL_PATH, STEAM_PATH, {
      buildIdPollDelaysMs: NO_POLL_DELAYS,
    });

    expect(mockGetServerBuildId).toHaveBeenCalledWith(
      APP_ID,
      STEAM_PATH,
      INSTALL_PATH
    );
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

  it("fails at verifying (partial download) when the post-update buildid is unchanged, but still restarts", async () => {
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
    expect(result.success).toBe(false);
    expect(result.stage).toBe("verifying");
    expect(result.updated).toBe(false);
    expect(result.previousBuildId).toBe("100");
    expect(result.newBuildId).toBe("100");
    expect(result.error).toContain("100");
    expect(result.error).toContain("101");
    expect(mockStartServer).toHaveBeenCalledWith(APP_ID, INSTALL_PATH);
  });

  it("fails at verifying when the post-update buildid does not match the remote buildid", async () => {
    mockGetServerBuildId.mockResolvedValueOnce("100").mockResolvedValue("102");
    mockFetchRemoteAppBuildId.mockResolvedValue({
      success: true,
      buildId: "101",
    });

    const result = await autoUpdateServer(APP_ID, INSTALL_PATH, STEAM_PATH, {
      buildIdPollDelaysMs: NO_POLL_DELAYS,
    });

    expect(result.success).toBe(false);
    expect(result.stage).toBe("verifying");
    expect(result.updated).toBe(false);
    expect(result.newBuildId).toBe("102");
    expect(result.error).toContain("101");
    expect(mockStartServer).toHaveBeenCalledWith(APP_ID, INSTALL_PATH);
  });

  it("restarts and reports complete when the buildid reached the remote buildid", async () => {
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

  it("polls the buildid with backoff until it matches the remote buildid", async () => {
    mockGetServerBuildId
      .mockResolvedValueOnce("100") // before update
      .mockResolvedValueOnce("100") // first verify poll: unchanged
      .mockResolvedValue("101"); // second verify poll: matches remote

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

  it("fails at verifying and restarts when the buildid cannot be read after the update", async () => {
    mockGetServerBuildId.mockResolvedValueOnce("100").mockResolvedValue(null);

    const result = await autoUpdateServer(APP_ID, INSTALL_PATH, STEAM_PATH, {
      buildIdPollDelaysMs: NO_POLL_DELAYS,
    });

    expect(result.success).toBe(false);
    expect(result.stage).toBe("verifying");
    expect(result.updated).toBe(false);
    expect(result.error).toMatch(/manifest/i);
    expect(mockStartServer).toHaveBeenCalledWith(APP_ID, INSTALL_PATH);
  });

  it("fails at restarting with both errors when an incomplete update also fails to restart", async () => {
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
    expect(result.error).toMatch(/did not complete|incomplete/i);
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

  it("waits the full default 5-minute warn window before stopping", async () => {
    jest.useFakeTimers();
    try {
      mockGetServerBuildId
        .mockResolvedValueOnce("100")
        .mockResolvedValue("101");
      mockGetPalworldRestStatus.mockResolvedValue({
        success: true,
        enabled: true,
        isPalworld: true,
        port: 8212,
      });
      mockInvokePalworldRest.mockResolvedValue({ success: true, data: {} });

      // No warnBeforeUpdateMs override: the default 5-minute window applies.
      const pending = autoUpdateServer(
        PALWORLD_APP_ID,
        PALWORLD_INSTALL,
        STEAM_PATH,
        { buildIdPollDelaysMs: NO_POLL_DELAYS }
      );

      await jest.advanceTimersByTimeAsync(0);
      expect(mockInvokePalworldRest).toHaveBeenCalled();

      // 1s shy of 5 minutes: still inside the warn window, no downtime yet.
      await jest.advanceTimersByTimeAsync(5 * 60 * 1000 - 1000);
      expect(mockStopServer).not.toHaveBeenCalled();

      await jest.advanceTimersByTimeAsync(1000);
      const result = await pending;

      expect(mockStopServer).toHaveBeenCalled();
      expect(result.stage).toBe("complete");
    } finally {
      jest.useRealTimers();
    }
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

  it("does not consult REST or the server query for games without update_announce", async () => {
    const hasCapability = jest
      .spyOn(getCapabilityRepository(), "hasCapability")
      .mockReturnValue(false);
    try {
      mockGetServerBuildId
        .mockResolvedValueOnce("100")
        .mockResolvedValue("101");

      const result = await autoUpdateServer(APP_ID, INSTALL_PATH, STEAM_PATH, {
        buildIdPollDelaysMs: NO_POLL_DELAYS,
        warnBeforeUpdateMs: 0,
      });

      expect(hasCapability).toHaveBeenCalledWith(APP_ID, "update_announce");
      expect(mockGetPalworldRestStatus).not.toHaveBeenCalled();
      expect(mockInvokePalworldRest).not.toHaveBeenCalled();
      expect(mockGetGameQuerySnapshot).not.toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.stage).toBe("complete");
      expect(result.updated).toBe(true);
    } finally {
      hasCapability.mockRestore();
    }
  });

  describe("player-aware gate for query-protocol games (042.5)", () => {
    it("defers without stopping while players are online", async () => {
      mockGetServerBuildId.mockResolvedValue("100");
      mockGetGameQuerySnapshot.mockResolvedValue(querySnapshot(2));

      const result = await autoUpdateServer(APP_ID, INSTALL_PATH, STEAM_PATH, {
        buildIdPollDelaysMs: NO_POLL_DELAYS,
      });

      expect(result).toEqual({
        success: true,
        stage: "deferred",
        updated: false,
        previousBuildId: "100",
        playersOnline: 2,
      });
      expect(mockGetGameQuerySnapshot).toHaveBeenCalledWith(
        APP_ID,
        INSTALL_PATH
      );
      expect(mockStopServer).not.toHaveBeenCalled();
      expect(mockRunSteamCmdUpdate).not.toHaveBeenCalled();
      expect(mockStartServer).not.toHaveBeenCalled();
    });

    it("never announces over REST for a query-protocol game", async () => {
      mockGetServerBuildId.mockResolvedValue("100");
      mockGetGameQuerySnapshot.mockResolvedValue(querySnapshot(1));

      const result = await autoUpdateServer(APP_ID, INSTALL_PATH, STEAM_PATH, {
        buildIdPollDelaysMs: NO_POLL_DELAYS,
      });

      expect(result.stage).toBe("deferred");
      expect(mockGetPalworldRestStatus).not.toHaveBeenCalled();
      expect(mockInvokePalworldRest).not.toHaveBeenCalled();
    });

    it("updates without a warn window when the server is empty", async () => {
      jest.useFakeTimers();
      try {
        mockGetServerBuildId
          .mockResolvedValueOnce("100")
          .mockResolvedValue("101");
        mockGetGameQuerySnapshot.mockResolvedValue(querySnapshot(0));

        // No warnBeforeUpdateMs override and no timer advance: a 5-minute
        // wait here would hang this await under fake timers.
        const result = await autoUpdateServer(
          APP_ID,
          INSTALL_PATH,
          STEAM_PATH,
          { buildIdPollDelaysMs: NO_POLL_DELAYS }
        );

        expect(mockStopServer).toHaveBeenCalledWith(APP_ID, INSTALL_PATH);
        expect(mockRunSteamCmdUpdate).toHaveBeenCalled();
        expect(result.success).toBe(true);
        expect(result.stage).toBe("complete");
        expect(result.updated).toBe(true);
      } finally {
        jest.useRealTimers();
      }
    });

    it("does not count bots as players online", async () => {
      mockGetServerBuildId
        .mockResolvedValueOnce("100")
        .mockResolvedValue("101");
      mockGetGameQuerySnapshot.mockResolvedValue(querySnapshot(2, 2));

      const result = await autoUpdateServer(APP_ID, INSTALL_PATH, STEAM_PATH, {
        buildIdPollDelaysMs: NO_POLL_DELAYS,
      });

      expect(result.stage).toBe("complete");
      expect(mockStopServer).toHaveBeenCalled();
    });

    it("defers when the player list shows someone the info count missed", async () => {
      mockGetServerBuildId.mockResolvedValue("100");
      mockGetGameQuerySnapshot.mockResolvedValue({
        ...querySnapshot(0),
        players: [{ name: "", score: 0, durationSeconds: 3 }],
      });

      const result = await autoUpdateServer(APP_ID, INSTALL_PATH, STEAM_PATH, {
        buildIdPollDelaysMs: NO_POLL_DELAYS,
      });

      expect(result.stage).toBe("deferred");
      expect(result.playersOnline).toBe(1);
      expect(mockStopServer).not.toHaveBeenCalled();
    });

    it("fails closed at notifying when the player check fails, without claiming an announce", async () => {
      mockGetServerBuildId.mockResolvedValue("100");
      mockGetGameQuerySnapshot.mockResolvedValue({
        success: false,
        errorKind: "timeout",
        error: "No response from 127.0.0.1:15637 within 2000 ms",
        host: "127.0.0.1",
        port: 15637,
      });

      const result = await autoUpdateServer(APP_ID, INSTALL_PATH, STEAM_PATH, {
        buildIdPollDelaysMs: NO_POLL_DELAYS,
      });

      expect(result).toEqual({
        success: false,
        stage: "notifying",
        updated: false,
        previousBuildId: "100",
        error:
          "Could not check for online players before updating (timeout: No response from 127.0.0.1:15637 within 2000 ms). Update deferred; server was left running.",
      });
      expect(result.error).not.toMatch(/announc/i);
      expect(mockStopServer).not.toHaveBeenCalled();
      expect(mockRunSteamCmdUpdate).not.toHaveBeenCalled();
    });

    it("fails closed when a successful query carries no server info", async () => {
      mockGetServerBuildId.mockResolvedValue("100");
      mockGetGameQuerySnapshot.mockResolvedValue({ success: true });

      const result = await autoUpdateServer(APP_ID, INSTALL_PATH, STEAM_PATH, {
        buildIdPollDelaysMs: NO_POLL_DELAYS,
      });

      expect(result.success).toBe(false);
      expect(result.stage).toBe("notifying");
      expect(result.error).toContain("unknown query error");
      expect(mockStopServer).not.toHaveBeenCalled();
    });

    it("only checks players once an update is actually available", async () => {
      mockGetServerBuildId.mockResolvedValue("101");

      const result = await autoUpdateServer(APP_ID, INSTALL_PATH, STEAM_PATH, {
        buildIdPollDelaysMs: NO_POLL_DELAYS,
      });

      expect(result.stage).toBe("no-update");
      expect(mockGetGameQuerySnapshot).not.toHaveBeenCalled();
    });

    it("keeps Palworld on the REST announce path without querying", async () => {
      mockGetServerBuildId
        .mockResolvedValueOnce("100")
        .mockResolvedValue("101");
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
      expect(mockGetGameQuerySnapshot).not.toHaveBeenCalled();
      expect(result.stage).toBe("complete");
    });
  });
});
