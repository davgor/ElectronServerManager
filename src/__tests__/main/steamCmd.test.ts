/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call */

import { EventEmitter } from "events";
import { existsSync } from "fs";
import * as childProcess from "child_process";

import {
  resolveSteamCmdPath,
  runSteamCmdUpdate,
  selectSteamCmdPath,
} from "../../main/steamCmd";

jest.mock("fs", () => ({
  existsSync: jest.fn(),
}));

jest.mock("child_process", () => ({
  spawn: jest.fn(),
  execSync: jest.fn(),
}));

const mockExistsSync = existsSync as jest.MockedFunction<typeof existsSync>;
const mockSpawn = jest.mocked(childProcess.spawn);
const mockExecSync = jest.mocked(childProcess.execSync);

interface FakeChild extends EventEmitter {
  stdout: EventEmitter;
  stderr: EventEmitter;
  kill: jest.Mock;
}

function createFakeChild(): FakeChild {
  const child = new EventEmitter() as FakeChild;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = jest.fn();
  return child;
}

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

describe("steamCmd", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe("resolveSteamCmdPath", () => {
    it("returns the configured path when it exists", () => {
      mockExistsSync.mockImplementation(
        (p) => p === "/opt/steamcmd/steamcmd.sh"
      );

      expect(resolveSteamCmdPath("/opt/steamcmd/steamcmd.sh")).toBe(
        "/opt/steamcmd/steamcmd.sh"
      );
    });

    it("returns null when the configured path does not exist", () => {
      mockExistsSync.mockReturnValue(false);
      mockExecSync.mockImplementation(() => {
        throw new Error("not found");
      });

      expect(resolveSteamCmdPath("/missing/steamcmd.sh")).toBeNull();
    });

    it("finds steamcmd on PATH when no path is configured", () => {
      const original = setPlatform("linux");
      mockExistsSync.mockReturnValue(false);
      mockExecSync.mockReturnValue("/usr/bin/steamcmd\n" as never);

      expect(resolveSteamCmdPath()).toBe("/usr/bin/steamcmd");
      expect(mockExecSync).toHaveBeenCalledWith("which steamcmd", {
        encoding: "utf8",
      });

      restorePlatform(original);
    });

    it("uses 'where' for the PATH lookup on win32", () => {
      const original = setPlatform("win32");
      mockExistsSync.mockReturnValue(false);
      mockExecSync.mockReturnValue("C:\\steamcmd\\steamcmd.exe\r\n" as never);

      expect(resolveSteamCmdPath()).toBe("C:\\steamcmd\\steamcmd.exe");
      expect(mockExecSync).toHaveBeenCalledWith("where steamcmd", {
        encoding: "utf8",
      });

      restorePlatform(original);
    });

    it("falls back to well-known install locations", () => {
      const original = setPlatform("linux");
      mockExecSync.mockImplementation(() => {
        throw new Error("not on PATH");
      });
      mockExistsSync.mockImplementation((p) => p === "/usr/games/steamcmd");

      expect(resolveSteamCmdPath()).toBe("/usr/games/steamcmd");

      restorePlatform(original);
    });

    it("returns null when steamcmd cannot be found anywhere", () => {
      mockExistsSync.mockReturnValue(false);
      mockExecSync.mockImplementation(() => {
        throw new Error("not on PATH");
      });

      expect(resolveSteamCmdPath()).toBeNull();
    });
  });

  describe("runSteamCmdUpdate", () => {
    const INSTALL_PATH = "/steam/common/EnshroudedServer";

    it("runs force_install_dir before app_update and resolves success on exit 0", async () => {
      const child = createFakeChild();
      mockSpawn.mockReturnValue(
        child as unknown as ReturnType<typeof childProcess.spawn>
      );

      const pending = runSteamCmdUpdate(
        "/usr/bin/steamcmd",
        2278520,
        INSTALL_PATH
      );
      child.emit("exit", 0, null);

      await expect(pending).resolves.toEqual({ success: true });
      expect(mockSpawn).toHaveBeenCalledWith(
        "/usr/bin/steamcmd",
        [
          "+force_install_dir",
          INSTALL_PATH,
          "+login",
          "anonymous",
          "+app_update",
          "2278520",
          "validate",
          "+quit",
        ],
        expect.objectContaining({ shell: false })
      );
    });

    it("treats exit code 7 as success (steamcmd quirk on Windows)", async () => {
      const child = createFakeChild();
      mockSpawn.mockReturnValue(
        child as unknown as ReturnType<typeof childProcess.spawn>
      );

      const pending = runSteamCmdUpdate(
        "C:\\steamcmd\\steamcmd.exe",
        2278520,
        "D:\\servers\\EnshroudedServer"
      );
      child.emit("exit", 7, null);

      await expect(pending).resolves.toEqual({ success: true });
    });

    it("resolves failure with stderr detail on non-zero exit", async () => {
      const child = createFakeChild();
      mockSpawn.mockReturnValue(
        child as unknown as ReturnType<typeof childProcess.spawn>
      );

      const pending = runSteamCmdUpdate(
        "/usr/bin/steamcmd",
        2278520,
        INSTALL_PATH
      );
      child.stderr.emit("data", Buffer.from("No subscription"));
      child.emit("exit", 8, null);

      const result = await pending;
      expect(result.success).toBe(false);
      expect(result.error).toContain("exit code 8");
      expect(result.error).toContain("No subscription");
    });

    it("resolves failure when spawn errors", async () => {
      const child = createFakeChild();
      mockSpawn.mockReturnValue(
        child as unknown as ReturnType<typeof childProcess.spawn>
      );

      const pending = runSteamCmdUpdate(
        "/usr/bin/steamcmd",
        2278520,
        INSTALL_PATH
      );
      child.emit("error", new Error("ENOENT"));

      const result = await pending;
      expect(result.success).toBe(false);
      expect(result.error).toContain("ENOENT");
    });

    it("kills the process and resolves failure on timeout", async () => {
      const child = createFakeChild();
      mockSpawn.mockReturnValue(
        child as unknown as ReturnType<typeof childProcess.spawn>
      );

      const result = await runSteamCmdUpdate(
        "/usr/bin/steamcmd",
        2278520,
        INSTALL_PATH,
        {
          timeoutMs: 5,
        }
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("timed out");
      expect(child.kill).toHaveBeenCalled();
    });

    it("resolves only once when exit follows a timeout kill", async () => {
      const child = createFakeChild();
      mockSpawn.mockReturnValue(
        child as unknown as ReturnType<typeof childProcess.spawn>
      );

      const result = await runSteamCmdUpdate(
        "/usr/bin/steamcmd",
        2278520,
        INSTALL_PATH,
        {
          timeoutMs: 5,
        }
      );
      // The killed child eventually emits exit; this must not throw or
      // change the already-resolved outcome.
      child.emit("exit", null, "SIGKILL");

      expect(result.success).toBe(false);
    });
  });

  describe("selectSteamCmdPath", () => {
    it("returns error when main window is unavailable", async () => {
      const result = await selectSteamCmdPath(() => null, {
        showOpenDialog: jest.fn(),
      });

      expect(result).toEqual({
        success: false,
        path: null,
        error: "Main window not available",
      });
    });

    it("returns selected path when dialog succeeds", async () => {
      const showOpenDialog = jest.fn().mockResolvedValue({
        canceled: false,
        filePaths: ["C:\\steamcmd\\steamcmd.exe"],
      });

      const result = await selectSteamCmdPath(() => ({}) as never, {
        showOpenDialog,
      });

      expect(result).toEqual({
        success: true,
        path: "C:\\steamcmd\\steamcmd.exe",
      });
      expect(showOpenDialog).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          properties: ["openFile"],
          title: "Select SteamCMD Executable",
        })
      );
    });

    it("returns canceled result when dialog is dismissed", async () => {
      const showOpenDialog = jest.fn().mockResolvedValue({
        canceled: true,
        filePaths: [],
      });

      const result = await selectSteamCmdPath(() => ({}) as never, {
        showOpenDialog,
      });

      expect(result).toEqual({
        success: false,
        path: null,
      });
    });
  });
});
