/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call */

import { existsSync } from "fs";
import * as childProcess from "child_process";

import {
  buildKillCommand,
  killServerProcess,
  startServer,
  stopServer,
} from "../../main/serverProcess";

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

describe("serverProcess", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockSpawn.mockReturnValue({
      on: jest.fn().mockReturnThis(),
      stderr: { on: jest.fn() },
      stdout: { on: jest.fn() },
      unref: jest.fn(),
    } as unknown as ReturnType<typeof childProcess.spawn>);
  });

  describe("buildKillCommand", () => {
    it("builds Windows taskkill command", () => {
      expect(buildKillCommand("enshrouded_server.exe", "win32")).toBe(
        "taskkill /F /IM enshrouded_server.exe 2>nul || exit /b 0"
      );
    });

    it("builds Unix pkill command", () => {
      expect(buildKillCommand("PalServer.exe", "linux")).toBe(
        'pkill -f "PalServer" || true'
      );
    });
  });

  describe("killServerProcess", () => {
    it("executes win32 kill command", () => {
      const original = Object.getOwnPropertyDescriptor(process, "platform");
      Object.defineProperty(process, "platform", {
        value: "win32",
        configurable: true,
      });

      killServerProcess("enshrouded_server.exe");

      expect(mockExecSync).toHaveBeenCalledWith(
        "taskkill /F /IM enshrouded_server.exe 2>nul || exit /b 0"
      );

      if (original) {
        Object.defineProperty(process, "platform", original);
      }
    });

    it("executes unix kill command", () => {
      const original = Object.getOwnPropertyDescriptor(process, "platform");
      Object.defineProperty(process, "platform", {
        value: "linux",
        configurable: true,
      });

      killServerProcess("PalServer.exe");

      expect(mockExecSync).toHaveBeenCalledWith('pkill -f "PalServer" || true');

      if (original) {
        Object.defineProperty(process, "platform", original);
      }
    });

    it("ignores exec errors when process is not running", () => {
      mockExecSync.mockImplementationOnce(() => {
        throw new Error("not found");
      });

      expect(() => killServerProcess("missing.exe")).not.toThrow();
    });
  });

  describe("startServer", () => {
    it("returns error for unknown app id", () => {
      const result = startServer(999999, "C:\\Games\\Unknown");

      expect(result).toEqual({
        success: false,
        error: "Unknown server app ID or executable not defined: 999999",
      });
    });

    it("returns error when executable is missing", () => {
      mockExistsSync.mockReturnValueOnce(false);

      const result = startServer(2278520, "C:\\Games\\EnshroudedServer");

      expect(result.success).toBe(false);
      expect(result.error).toContain("Server executable not found");
    });

    it("spawns detached process when executable exists", () => {
      mockExistsSync.mockReturnValue(true);

      const result = startServer(2278520, "C:\\Games\\EnshroudedServer");

      expect(result).toEqual({ success: true });
      const spawnCall = mockSpawn.mock.calls[0];
      expect(spawnCall[0]).toContain("enshrouded_server.exe");
      expect(spawnCall[1]).toEqual([]);
      expect(spawnCall[2]).toEqual(
        expect.objectContaining({
          cwd: "C:\\Games\\EnshroudedServer",
          detached: true,
          shell: true,
        })
      );
    });
  });

  describe("stopServer", () => {
    it("returns error for unknown app id", () => {
      const result = stopServer(999999, "C:\\Games\\Unknown");

      expect(result).toEqual({
        success: false,
        error: "Unknown server app ID or executable not defined: 999999",
      });
    });

    it("runs kill command for known server", () => {
      const original = Object.getOwnPropertyDescriptor(process, "platform");
      Object.defineProperty(process, "platform", {
        value: "win32",
        configurable: true,
      });

      const result = stopServer(2278520, "C:\\Games\\EnshroudedServer");

      expect(result).toEqual({ success: true });
      expect(mockExecSync).toHaveBeenCalledWith(
        "taskkill /F /IM enshrouded_server.exe 2>nul || exit /b 0"
      );

      if (original) {
        Object.defineProperty(process, "platform", original);
      }
    });
  });
});
