/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
jest.mock("child_process", () => ({
  execSync: jest.fn(),
}));

jest.mock("electron", () => ({
  shell: {
    openPath: jest.fn(),
  },
}));

jest.mock("../../main/driveUtils", () => ({
  getCommonSteamPaths: jest.fn(),
}));

jest.mock("../../main/steamDetection", () => ({
  findInstalledServers: jest.fn(),
}));

jest.mock("../../main/logger", () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));

import { execSync } from "child_process";

import { getCommonSteamPaths } from "../../main/driveUtils";
import {
  collectDiagnostics,
  fetchSteamServers,
  listSteamPaths,
  openFileDefault,
} from "../../main/steamIpc";
import { findInstalledServers } from "../../main/steamDetection";

const mockExecSync = execSync as unknown as jest.Mock;
const mockOpenPath = jest.requireMock("electron").shell.openPath;
const mockGetCommonSteamPaths = getCommonSteamPaths as jest.MockedFunction<
  typeof getCommonSteamPaths
>;
const mockFindInstalledServers = findInstalledServers as jest.MockedFunction<
  typeof findInstalledServers
>;

describe("steamIpc", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe("collectDiagnostics", () => {
    it("reports process execution, platform, and steam paths", () => {
      mockExecSync.mockReturnValue("test\n");
      mockGetCommonSteamPaths.mockReturnValue(["C:\\Steam"]);

      const result = collectDiagnostics();

      expect(result.canExecuteProcesses).toBe(true);
      expect(result.platform).toBe(process.platform);
      expect(result.steamFound).toBe(true);
      expect(result.steamPaths).toEqual(["C:\\Steam"]);
    });

    it("marks steamFound false when path discovery throws", () => {
      mockExecSync.mockReturnValue("test\n");
      mockGetCommonSteamPaths.mockImplementation(() => {
        throw new Error("no drives");
      });

      const result = collectDiagnostics();

      expect(result.steamFound).toBe(false);
      expect(result.steamError).toBe("no drives");
    });
  });

  describe("listSteamPaths", () => {
    it("returns steam paths from drive utils", () => {
      mockGetCommonSteamPaths.mockReturnValue(["/steam", "/library"]);

      expect(listSteamPaths()).toEqual(["/steam", "/library"]);
    });

    it("returns an empty array when discovery fails", () => {
      mockGetCommonSteamPaths.mockImplementation(() => {
        throw new Error("boom");
      });

      expect(listSteamPaths()).toEqual([]);
    });
  });

  describe("fetchSteamServers", () => {
    it("returns servers when detection succeeds", async () => {
      const servers = [
        {
          name: "Enshrouded Dedicated Server",
          appId: 2278520,
          installPath: "/games/enshrouded",
          isRunning: false,
        },
      ];
      mockFindInstalledServers.mockResolvedValue(servers);

      await expect(fetchSteamServers("/steam")).resolves.toEqual({
        success: true,
        servers,
      });
      expect(mockFindInstalledServers).toHaveBeenCalledWith("/steam");
    });

    it("returns a failure payload when detection throws", async () => {
      mockFindInstalledServers.mockRejectedValue(new Error("missing library"));

      await expect(fetchSteamServers()).resolves.toEqual({
        success: false,
        error: "missing library",
        servers: [],
      });
    });
  });

  describe("openFileDefault", () => {
    it("rejects invalid paths", async () => {
      await expect(openFileDefault("")).resolves.toEqual({
        success: false,
        error: "Invalid file path",
      });
      expect(mockOpenPath).not.toHaveBeenCalled();
    });

    it("returns success when shell.openPath succeeds", async () => {
      mockOpenPath.mockResolvedValue("");

      await expect(openFileDefault("C:\\file.txt")).resolves.toEqual({
        success: true,
      });
      expect(mockOpenPath).toHaveBeenCalledWith("C:\\file.txt");
    });

    it("returns the shell error string when openPath fails", async () => {
      mockOpenPath.mockResolvedValue("Failed to open");

      await expect(openFileDefault("C:\\missing.txt")).resolves.toEqual({
        success: false,
        error: "Failed to open",
      });
    });
  });
});
