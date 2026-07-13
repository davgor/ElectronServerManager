/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call */

import { promises as fs } from "fs";
import { execSync } from "child_process";

import {
  ServerInfo,
  resolveServerExecutable,
  resolveServerConfigLocation,
  resolveServerSaveLocation,
  findInstalledServers,
  getSteamDedicatedServers,
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

const mockFs = fs as jest.Mocked<typeof fs>;
const mockExecSync = execSync as jest.MockedFunction<typeof execSync>;

const PALWORLD_APP_ID = 1623730;
const ENSHROUDED_APP_ID = 2278520;

function setPlatform(platform: NodeJS.Platform): PropertyDescriptor | null {
  const original = Object.getOwnPropertyDescriptor(process, "platform");
  Object.defineProperty(process, "platform", {
    value: platform,
    configurable: true,
  });
  return original ?? null;
}

function restorePlatform(original: PropertyDescriptor | null): void {
  if (original) {
    Object.defineProperty(process, "platform", original);
  }
}

describe("platform-aware resolution", () => {
  const catalog = getSteamDedicatedServers();
  const palworld = catalog[PALWORLD_APP_ID];
  const enshrouded = catalog[ENSHROUDED_APP_ID];

  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe("resolveServerExecutable", () => {
    it("resolves Palworld to PalServer.exe on win32", () => {
      expect(resolveServerExecutable(palworld, "win32")).toBe("PalServer.exe");
    });

    it("resolves Palworld to PalServer.sh on linux", () => {
      expect(resolveServerExecutable(palworld, "linux")).toBe("PalServer.sh");
    });

    it("resolves Enshrouded to enshrouded_server.exe on win32", () => {
      expect(resolveServerExecutable(enshrouded, "win32")).toBe(
        "enshrouded_server.exe"
      );
    });

    it("falls back to default executable on linux when no override exists (Enshrouded)", () => {
      expect(resolveServerExecutable(enshrouded, "linux")).toBe(
        "enshrouded_server.exe"
      );
    });

    it("falls back to default executable on darwin when no override exists", () => {
      expect(resolveServerExecutable(palworld, "darwin")).toBe("PalServer.exe");
      expect(resolveServerExecutable(enshrouded, "darwin")).toBe(
        "enshrouded_server.exe"
      );
    });

    it("defaults to process.platform when platform argument is omitted", () => {
      const original = setPlatform("linux");
      expect(resolveServerExecutable(palworld)).toBe("PalServer.sh");
      restorePlatform(original);
    });
  });

  describe("resolveServerConfigLocation", () => {
    it("resolves Palworld config to WindowsServer path on win32", () => {
      expect(resolveServerConfigLocation(palworld, "win32")).toBe(
        "Pal/Saved/Config/WindowsServer/PalWorldSettings.ini"
      );
    });

    it("resolves Palworld config to LinuxServer path on linux", () => {
      expect(resolveServerConfigLocation(palworld, "linux")).toBe(
        "Pal/Saved/Config/LinuxServer/PalWorldSettings.ini"
      );
    });

    it("falls back to default config location when no override exists (Enshrouded)", () => {
      expect(resolveServerConfigLocation(enshrouded, "linux")).toBe(
        "enshrouded_server.json"
      );
    });
  });

  describe("resolveServerSaveLocation", () => {
    it("falls back to default save location when no override exists", () => {
      expect(resolveServerSaveLocation(palworld, "linux")).toBe(
        "Pal/Saved/SaveGames"
      );
    });

    it("supports per-platform save location overrides", () => {
      const serverInfo: ServerInfo = {
        name: "Test Server",
        executable: "server.exe",
        saveLocation: "saves/windows",
        saveLocations: { linux: "saves/linux" },
      };

      expect(resolveServerSaveLocation(serverInfo, "linux")).toBe(
        "saves/linux"
      );
      expect(resolveServerSaveLocation(serverInfo, "win32")).toBe(
        "saves/windows"
      );
    });
  });

  describe("findInstalledServers process checks", () => {
    it("checks running processes with the linux-resolved executable", async () => {
      const original = setPlatform("linux");

      // libraryfolders.vdf read fails -> default library path is used
      mockFs.readFile.mockRejectedValue(new Error("ENOENT"));
      // manifests and app folders exist
      mockFs.stat.mockResolvedValue({} as never);
      // pgrep succeeds -> process running
      mockExecSync.mockReturnValue("" as never);

      await findInstalledServers("/home/user/.steam/steam");

      expect(mockExecSync).toHaveBeenCalledWith('pgrep -f "PalServer.sh"');
      expect(mockExecSync).toHaveBeenCalledWith(
        'pgrep -f "enshrouded_server.exe"'
      );

      restorePlatform(original);
    });
  });
});
