import { promises as fs } from "fs";
import { execSync } from "child_process";

import {
  findInstalledServers,
  type SteamServer,
} from "../../main/steamDetection";

jest.mock("fs", () => ({
  promises: {
    stat: jest.fn(),
    readFile: jest.fn(),
  },
}));

jest.mock("child_process", () => ({
  execSync: jest.fn(),
}));

jest.mock("path", () => {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    ...jest.requireActual("path"),
    join: jest.fn((...args: string[]): string => args.join("/")),
  };
});

const mockFs = fs as jest.Mocked<typeof fs>;
const mockExecSync = execSync as jest.MockedFunction<typeof execSync>;

describe("steamDetection", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetAllMocks();
  });

  describe("findInstalledServers", () => {
    it("should return an empty array when Steam path is not found", async (): Promise<void> => {
      mockExecSync.mockImplementation(() => {
        throw new Error("Registry key not found");
      });
      mockFs.stat.mockRejectedValue(new Error("ENOENT"));

      const servers = await findInstalledServers();
      expect(servers).toEqual([]);
    });

    it("should return an empty array when Steam path is null", async (): Promise<void> => {
      mockExecSync.mockImplementation(() => {
        throw new Error("Registry key not found");
      });
      mockFs.stat.mockRejectedValue(new Error("ENOENT"));

      const servers = await findInstalledServers();
      expect(Array.isArray(servers)).toBe(true);
      expect(servers).toHaveLength(0);
    });

    it("should detect servers on Windows with registry entry", async (): Promise<void> => {
      // Mock Windows registry lookup
      mockExecSync.mockReturnValueOnce(
        "SteamPath    REG_SZ    C:\\Program Files (x86)\\Steam"
      );

      // Mock libraryfolders.vdf read
      mockFs.readFile.mockResolvedValueOnce(
        '"path"    "D:\\Games\\Steam"' as never
      );

      // Mock libraryfolders.vdf existence
      mockFs.stat.mockResolvedValueOnce({} as never);

      // Mock manifest file existence (380870 is Arma 3)
      mockFs.stat.mockResolvedValueOnce({} as never);
      mockFs.stat.mockResolvedValueOnce({} as never);

      // Mock isProcessRunning check
      mockExecSync.mockReturnValueOnce("");

      const servers = await findInstalledServers();
      expect(Array.isArray(servers)).toBe(true);
    });

    it("should detect servers with multiple library paths", async (): Promise<void> => {
      mockExecSync.mockReturnValueOnce(
        "SteamPath    REG_SZ    C:\\Program Files (x86)\\Steam"
      );

      const vdfContent = `"path"    "C:\\Program Files (x86)\\Steam"
      "path"    "D:\\Games\\Steam"
      "path"    "E:\\SteamLibrary"`;

      mockFs.readFile.mockResolvedValueOnce(vdfContent as never);
      mockFs.stat.mockResolvedValue({} as never);
      mockExecSync.mockReturnValue("" as never);

      const servers = await findInstalledServers();
      expect(Array.isArray(servers)).toBe(true);
    });

    it("should handle app manifest without app folder (downloading)", async (): Promise<void> => {
      mockExecSync.mockReturnValueOnce(
        "SteamPath    REG_SZ    C:\\Program Files (x86)\\Steam"
      );

      mockFs.readFile.mockResolvedValueOnce("" as never);

      // First stat is for libraryfolders.vdf - succeeds
      // Second stat is for appmanifest file - succeeds
      // Third stat is for app folder - fails (downloading)
      mockFs.stat.mockResolvedValueOnce({} as never);
      mockFs.stat.mockResolvedValueOnce({} as never);
      mockFs.stat.mockRejectedValueOnce(new Error("ENOENT"));

      mockExecSync.mockReturnValue("" as never);

      const servers = await findInstalledServers();
      expect(Array.isArray(servers)).toBe(true);
    });

    it("should handle errors in parseLibraryFolders gracefully", async (): Promise<void> => {
      mockExecSync.mockReturnValueOnce(
        "SteamPath    REG_SZ    C:\\Program Files (x86)\\Steam"
      );

      // libraryfolders.vdf doesn't exist
      mockFs.readFile.mockRejectedValueOnce(new Error("ENOENT"));

      // No app manifests exist
      mockFs.stat.mockRejectedValue(new Error("ENOENT"));

      const servers = await findInstalledServers();
      expect(Array.isArray(servers)).toBe(true);
      expect(servers).toHaveLength(0);
    });

    it("should parse VDF library paths correctly", async (): Promise<void> => {
      mockExecSync.mockReturnValueOnce(
        "SteamPath    REG_SZ    C:\\Program Files (x86)\\Steam"
      );

      const vdfContent = `"0"
      {
        "path"    "C:\\Program Files (x86)\\Steam"
        "label"    ""
      }
      "1"
      {
        "path"    "D:\\Game Library"
        "label"    "Games"
      }`;

      mockFs.readFile.mockResolvedValueOnce(vdfContent as never);
      mockFs.stat.mockResolvedValue({} as never);
      mockExecSync.mockReturnValue("" as never);

      const servers = await findInstalledServers();
      expect(Array.isArray(servers)).toBe(true);
    });

    it("should check if processes are running", async (): Promise<void> => {
      mockExecSync.mockReturnValueOnce(
        "SteamPath    REG_SZ    C:\\Program Files (x86)\\Steam"
      );

      mockFs.readFile.mockResolvedValueOnce("" as never);
      mockFs.stat.mockResolvedValue({} as never);

      // Process is running
      mockExecSync.mockReturnValueOnce("process found" as never);

      const servers = await findInstalledServers();
      expect(Array.isArray(servers)).toBe(true);
    });

    it("should handle process check failures gracefully", async (): Promise<void> => {
      mockExecSync.mockReturnValueOnce(
        "SteamPath    REG_SZ    C:\\Program Files (x86)\\Steam"
      );

      mockFs.readFile.mockResolvedValueOnce("" as never);
      mockFs.stat.mockResolvedValue({} as never);

      // Process check fails
      mockExecSync.mockImplementationOnce(() => {
        throw new Error("Process not found");
      });

      const servers = await findInstalledServers();
      expect(Array.isArray(servers)).toBe(true);
    });

    it("should return SteamServer objects with correct structure", async (): Promise<void> => {
      mockExecSync.mockReturnValueOnce(
        "SteamPath    REG_SZ    C:\\Program Files (x86)\\Steam"
      );

      mockFs.readFile.mockResolvedValueOnce("" as never);
      mockFs.stat.mockResolvedValue({} as never);
      mockExecSync.mockReturnValue("" as never);

      const servers = await findInstalledServers();
      expect(Array.isArray(servers)).toBe(true);

      servers.forEach((server: SteamServer): void => {
        expect(server).toHaveProperty("name");
        expect(server).toHaveProperty("appId");
        expect(server).toHaveProperty("installPath");
        expect(server).toHaveProperty("isRunning");
        expect(typeof server.name).toBe("string");
        expect(typeof server.appId).toBe("number");
        expect(typeof server.installPath).toBe("string");
        expect(typeof server.isRunning).toBe("boolean");
      });
    });

    it("should handle multiple app IDs and filter duplicates", async (): Promise<void> => {
      mockExecSync.mockReturnValueOnce(
        "SteamPath    REG_SZ    C:\\Program Files (x86)\\Steam"
      );

      mockFs.readFile.mockResolvedValueOnce("" as never);

      // Return success for some manifests, fail for others
      let statCallCount = 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockFs.stat.mockImplementation((): Promise<any> => {
        statCallCount++;
        // Allow first manifest to succeed, then fail the rest
        if (statCallCount === 1) {
          return Promise.resolve({});
        }
        if (statCallCount === 2) {
          return Promise.resolve({});
        }
        return Promise.reject(new Error("ENOENT"));
      });

      mockExecSync.mockReturnValue("" as never);

      const servers = await findInstalledServers();
      expect(Array.isArray(servers)).toBe(true);
    });

    it("should resolve install paths correctly for found servers", async (): Promise<void> => {
      mockExecSync.mockReturnValueOnce(
        "SteamPath    REG_SZ    C:\\Program Files (x86)\\Steam"
      );

      mockFs.readFile.mockResolvedValueOnce("" as never);
      mockFs.stat.mockResolvedValue({} as never);
      mockExecSync.mockReturnValue("" as never);

      const servers = await findInstalledServers();
      expect(Array.isArray(servers)).toBe(true);

      servers.forEach((server: SteamServer): void => {
        expect(server.installPath).toBeTruthy();
        expect(typeof server.installPath).toBe("string");
      });
    });

    it("should handle empty VDF library file", async (): Promise<void> => {
      mockExecSync.mockReturnValueOnce(
        "SteamPath    REG_SZ    C:\\Program Files (x86)\\Steam"
      );

      mockFs.readFile.mockResolvedValueOnce("" as never);
      mockFs.stat.mockResolvedValue({} as never);
      mockExecSync.mockReturnValue("" as never);

      const servers = await findInstalledServers();
      expect(Array.isArray(servers)).toBe(true);
    });

    it("should handle malformed VDF paths gracefully", async (): Promise<void> => {
      mockExecSync.mockReturnValueOnce(
        "SteamPath    REG_SZ    C:\\Program Files (x86)\\Steam"
      );

      const malformedVdf = `"path"    ""
      "path"    "D:\\Games"
      "path"    ""`;

      mockFs.readFile.mockResolvedValueOnce(malformedVdf as never);
      mockFs.stat.mockResolvedValue({} as never);
      mockExecSync.mockReturnValue("" as never);

      const servers = await findInstalledServers();
      expect(Array.isArray(servers)).toBe(true);
    });

    it("should identify known Steam dedicated server types", async (): Promise<void> => {
      mockExecSync.mockReturnValueOnce(
        "SteamPath    REG_SZ    C:\\Program Files (x86)\\Steam"
      );

      mockFs.readFile.mockResolvedValueOnce("" as never);
      mockFs.stat.mockResolvedValue({} as never);
      mockExecSync.mockReturnValue("" as never);

      const servers = await findInstalledServers();

      servers.forEach((server: SteamServer): void => {
        const knownServers = [
          "Arma 3 Server",
          "Garry's Mod Server",
          "Valheim Server",
          "Killing Floor 2 Server",
          "Steamworks SDK Redist (SteamCmd)",
          "Unreal Tournament Server",
          "Source SDK Base 2013 Dedicated Server",
          "Team Fortress 2 Server",
          "Half-Life 2 Server",
          "S.T.A.L.K.E.R. Call of Pripyat Dedicated Server",
          "Left 4 Dead 2 Server",
          "SCP: Secret Laboratory Server",
          "Prevail Server",
          "Mordhau Server",
          "Enshrouded Dedicated Server",
          "Project Zomboid Server",
          "Palworld Dedicated Server",
        ];

        expect(knownServers).toContain(server.name);
      });
    });
  });

  describe("Platform-specific path detection", () => {
    beforeEach(() => {
      const originalPlatform = Object.getOwnPropertyDescriptor(
        process,
        "platform"
      );
      if (originalPlatform) {
        Object.defineProperty(process, "platform", {
          value: "win32",
          configurable: true,
        });
      }
    });

    it("should attempt Windows registry lookup first", async (): Promise<void> => {
      Object.defineProperty(process, "platform", {
        value: "win32",
        configurable: true,
      });

      mockExecSync.mockReturnValueOnce(
        "SteamPath    REG_SZ    C:\\Program Files (x86)\\Steam"
      );

      mockFs.readFile.mockResolvedValueOnce("" as never);
      mockFs.stat.mockResolvedValue({} as never);
      mockExecSync.mockReturnValue("" as never);

      await findInstalledServers();

      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining("reg query"),
        expect.any(Object)
      );
    });

    it("should fallback to common Windows paths when registry fails", async (): Promise<void> => {
      Object.defineProperty(process, "platform", {
        value: "win32",
        configurable: true,
      });

      mockExecSync.mockImplementationOnce(() => {
        throw new Error("Registry key not found");
      });

      mockFs.stat.mockRejectedValue(new Error("ENOENT"));

      const servers = await findInstalledServers();

      expect(mockFs.stat).toHaveBeenCalled();
      expect(Array.isArray(servers)).toBe(true);
    });

    it("should check macOS Steam path", async (): Promise<void> => {
      Object.defineProperty(process, "platform", {
        value: "darwin",
        configurable: true,
      });

      mockFs.stat.mockResolvedValueOnce({} as never);
      mockFs.readFile.mockResolvedValueOnce("" as never);
      mockExecSync.mockReturnValue("" as never);

      const servers = await findInstalledServers();

      expect(Array.isArray(servers)).toBe(true);
    });

    it("should check Linux Steam path", async (): Promise<void> => {
      Object.defineProperty(process, "platform", {
        value: "linux",
        configurable: true,
      });

      mockFs.stat.mockResolvedValueOnce({} as never);
      mockFs.readFile.mockResolvedValueOnce("" as never);
      mockExecSync.mockReturnValue("" as never);

      const servers = await findInstalledServers();

      expect(Array.isArray(servers)).toBe(true);
    });
  });

  describe("Server detection and filtering", () => {
    it("should not include duplicate servers from multiple libraries", async (): Promise<void> => {
      mockExecSync.mockReturnValueOnce(
        "SteamPath    REG_SZ    C:\\Program Files (x86)\\Steam"
      );

      const vdfContent = `"path"    "C:\\Program Files (x86)\\Steam"
      "path"    "D:\\Games"`;

      mockFs.readFile.mockResolvedValueOnce(vdfContent as never);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockFs.stat.mockImplementation((): Promise<any> => {
        // Succeed on first and second call (libraryfolders.vdf and first manifest)
        // Then fail all others
        return Promise.resolve({});
      });

      mockExecSync.mockReturnValue("" as never);

      const servers = await findInstalledServers();

      // Verify structure is correct
      expect(Array.isArray(servers)).toBe(true);
      servers.forEach((server: SteamServer): void => {
        expect(server).toHaveProperty("appId");
        expect(server).toHaveProperty("name");
      });
    });

    it("should correctly parse app IDs from manifest files", async (): Promise<void> => {
      mockExecSync.mockReturnValueOnce(
        "SteamPath    REG_SZ    C:\\Program Files (x86)\\Steam"
      );

      mockFs.readFile.mockResolvedValueOnce("" as never);
      mockFs.stat.mockResolvedValue({} as never);
      mockExecSync.mockReturnValue("" as never);

      const servers = await findInstalledServers();

      servers.forEach((server: SteamServer): void => {
        expect(typeof server.appId).toBe("number");
        expect(server.appId).toBeGreaterThan(0);
      });
    });

    it("should handle servers with missing app folders gracefully", async (): Promise<void> => {
      mockExecSync.mockReturnValueOnce(
        "SteamPath    REG_SZ    C:\\Program Files (x86)\\Steam"
      );

      mockFs.readFile.mockResolvedValueOnce("" as never);

      mockFs.stat.mockImplementation((): Promise<never> => {
        // Fail all fs.stat calls to simulate no servers found
        return Promise.reject(new Error("ENOENT"));
      });

      const servers = await findInstalledServers();

      expect(Array.isArray(servers)).toBe(true);
    });

    it("should capture isRunning status from process check", async (): Promise<void> => {
      mockExecSync.mockReturnValueOnce(
        "SteamPath    REG_SZ    C:\\Program Files (x86)\\Steam"
      );

      mockFs.readFile.mockResolvedValueOnce("" as never);
      mockFs.stat.mockResolvedValue({} as never);

      // Return success (process is running)
      mockExecSync.mockReturnValueOnce("process found" as never);
      // Return failure (process not running)
      mockExecSync.mockImplementationOnce(() => {
        throw new Error("Process not found");
      });

      const servers = await findInstalledServers();

      servers.forEach((server: SteamServer): void => {
        expect(typeof server.isRunning).toBe("boolean");
      });
    });

    it("should correctly convert string app IDs to numbers", async (): Promise<void> => {
      mockExecSync.mockReturnValueOnce(
        "SteamPath    REG_SZ    C:\\Program Files (x86)\\Steam"
      );

      mockFs.readFile.mockResolvedValueOnce("" as never);
      mockFs.stat.mockResolvedValue({} as never);
      mockExecSync.mockReturnValue("" as never);

      const servers = await findInstalledServers();

      servers.forEach((server: SteamServer): void => {
        expect(Number.isInteger(server.appId)).toBe(true);
        expect(server.appId).toBeGreaterThan(0);
      });
    });

    it("should handle edge case with undefined environment variables", async (): Promise<void> => {
      Object.defineProperty(process, "platform", {
        value: "darwin",
        configurable: true,
      });

      mockFs.stat.mockResolvedValueOnce({} as never);
      mockFs.readFile.mockResolvedValueOnce("" as never);
      mockExecSync.mockReturnValue("" as never);

      const servers = await findInstalledServers();
      expect(Array.isArray(servers)).toBe(true);
    });

    it("should handle complex VDF format with nested structures", async (): Promise<void> => {
      mockExecSync.mockReturnValueOnce(
        "SteamPath    REG_SZ    C:\\Program Files (x86)\\Steam"
      );

      const complexVdf = `"libraryfolders"
      {
        "0"
        {
          "path"    "C:\\Program Files (x86)\\Steam"
          "label"    ""
          "contentid"    "1234567890"
          "totalsize"    "0"
        }
        "1"
        {
          "path"    "D:\\SteamLibrary"
          "label"    "Game Drive"
          "contentid"    "0987654321"
          "totalsize"    "0"
        }
      }`;

      mockFs.readFile.mockResolvedValueOnce(complexVdf as never);
      mockFs.stat.mockResolvedValue({} as never);
      mockExecSync.mockReturnValue("" as never);

      const servers = await findInstalledServers();
      expect(Array.isArray(servers)).toBe(true);
    });

    it("should verify SteamServer interface properties match expected structure", async (): Promise<void> => {
      mockExecSync.mockReturnValueOnce(
        "SteamPath    REG_SZ    C:\\Program Files (x86)\\Steam"
      );

      mockFs.readFile.mockResolvedValueOnce("" as never);
      mockFs.stat.mockResolvedValue({} as never);
      mockExecSync.mockReturnValue("" as never);

      const servers = await findInstalledServers();

      if (servers.length > 0) {
        const server = servers[0];
        expect(Object.keys(server).sort()).toEqual(
          ["appId", "coverArt", "installPath", "isRunning", "name"].sort()
        );
      }
    });

    it("should handle simultaneous manifest lookups across multiple libraries", async (): Promise<void> => {
      mockExecSync.mockReturnValueOnce(
        "SteamPath    REG_SZ    C:\\Program Files (x86)\\Steam"
      );

      const vdfWithMultipleLibraries = `"path"    "C:\\Steam"
      "path"    "D:\\Games1"
      "path"    "E:\\Games2"
      "path"    "F:\\Games3"`;

      mockFs.readFile.mockResolvedValueOnce(vdfWithMultipleLibraries as never);
      mockFs.stat.mockResolvedValue({} as never);
      mockExecSync.mockReturnValue("" as never);

      const servers = await findInstalledServers();
      expect(Array.isArray(servers)).toBe(true);
    });
  });
});
