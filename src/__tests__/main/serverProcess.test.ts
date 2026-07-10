/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call */

import { EventEmitter } from "events";
import { existsSync } from "fs";
import * as childProcess from "child_process";

import { isProcessRunning } from "../../main/steamDetection";
import {
  buildKillCommand,
  killServerProcessByName,
  getTrackedPid,
  resetTrackedPidsForTests,
  startServer,
  stopServer,
} from "../../main/serverProcess";

jest.mock("fs", () => ({
  existsSync: jest.fn(),
}));

jest.mock("child_process", () => ({
  spawn: jest.fn(),
  spawnSync: jest.fn(),
}));

jest.mock("../../main/steamDetection", () => ({
  ...jest.requireActual<typeof import("../../main/steamDetection")>(
    "../../main/steamDetection"
  ),
  isProcessRunning: jest.fn(),
}));

const mockExistsSync = existsSync as jest.MockedFunction<typeof existsSync>;
const mockSpawn = jest.mocked(childProcess.spawn);
const mockSpawnSync = jest.mocked(childProcess.spawnSync);
const mockIsProcessRunning = jest.mocked(isProcessRunning);

function spawnSyncResult(
  status: number | null,
  overrides?: Partial<ReturnType<typeof childProcess.spawnSync>>
): ReturnType<typeof childProcess.spawnSync> {
  return {
    pid: 1,
    output: [],
    stdout: Buffer.from(""),
    stderr: Buffer.from(""),
    status,
    signal: null,
    ...overrides,
  } as ReturnType<typeof childProcess.spawnSync>;
}

interface FakeChild extends EventEmitter {
  stdout: EventEmitter;
  stderr: EventEmitter;
  unref: jest.Mock;
  pid?: number;
}

function createFakeChild(pid: number | undefined = 4242): FakeChild {
  const child = new EventEmitter() as FakeChild;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.unref = jest.fn();
  child.pid = pid;
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

describe("serverProcess", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    resetTrackedPidsForTests();
    mockIsProcessRunning.mockReturnValue(true);
    mockSpawnSync.mockReturnValue(spawnSyncResult(0));
    mockSpawn.mockImplementation(
      () =>
        createFakeChild() as unknown as ReturnType<typeof childProcess.spawn>
    );
  });

  describe("buildKillCommand", () => {
    it("builds Windows taskkill command and args", () => {
      expect(buildKillCommand("enshrouded_server.exe", "win32")).toEqual({
        command: "taskkill",
        args: ["/F", "/IM", "enshrouded_server.exe"],
      });
    });

    it("builds Unix pkill command and args", () => {
      expect(buildKillCommand("PalServer.exe", "linux")).toEqual({
        command: "pkill",
        args: ["-f", "PalServer"],
      });
    });
  });

  describe("killServerProcessByName", () => {
    it("runs taskkill without a shell and reports success on win32", () => {
      const original = setPlatform("win32");

      const result = killServerProcessByName("enshrouded_server.exe");

      expect(result).toEqual({ success: true });
      expect(mockSpawnSync).toHaveBeenCalledWith("taskkill", [
        "/F",
        "/IM",
        "enshrouded_server.exe",
      ]);

      restorePlatform(original);
    });

    it("runs pkill without a shell and reports success on unix", () => {
      const original = setPlatform("linux");

      const result = killServerProcessByName("PalServer.exe");

      expect(result).toEqual({ success: true });
      expect(mockSpawnSync).toHaveBeenCalledWith("pkill", ["-f", "PalServer"]);

      restorePlatform(original);
    });

    it("treats pkill no-match (status 1) as success on unix", () => {
      const original = setPlatform("linux");
      mockSpawnSync.mockReturnValueOnce(spawnSyncResult(1));

      expect(killServerProcessByName("missing.exe")).toEqual({ success: true });

      restorePlatform(original);
    });

    it("treats taskkill no-match (status 128) as success on win32", () => {
      const original = setPlatform("win32");
      mockSpawnSync.mockReturnValueOnce(spawnSyncResult(128));

      expect(killServerProcessByName("missing.exe")).toEqual({ success: true });

      restorePlatform(original);
    });

    it("surfaces real kill failures with stderr detail", () => {
      const original = setPlatform("linux");
      mockSpawnSync.mockReturnValueOnce(
        spawnSyncResult(2, { stderr: Buffer.from("pkill: bad pattern") })
      );

      const result = killServerProcessByName("PalServer.exe");

      expect(result.success).toBe(false);
      expect(result.error).toContain("bad pattern");

      restorePlatform(original);
    });

    it("surfaces spawn errors when the kill tool cannot run", () => {
      const original = setPlatform("linux");
      mockSpawnSync.mockReturnValueOnce(
        spawnSyncResult(null, { error: new Error("ENOENT") })
      );

      const result = killServerProcessByName("PalServer.exe");

      expect(result.success).toBe(false);
      expect(result.error).toContain("ENOENT");

      restorePlatform(original);
    });
  });

  describe("startServer", () => {
    it("returns error for unknown app id", async () => {
      const result = await startServer(999999, "C:\\Games\\Unknown", {
        startupVerifyDelayMs: 0,
      });

      expect(result).toEqual({
        success: false,
        error: "Unknown server app ID or executable not defined: 999999",
      });
    });

    it("returns error when executable is missing", async () => {
      mockExistsSync.mockReturnValueOnce(false);

      const result = await startServer(2278520, "C:\\Games\\EnshroudedServer", {
        startupVerifyDelayMs: 0,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Server executable not found");
    });

    it("spawns without a shell and succeeds when the process stays up", async () => {
      mockExistsSync.mockReturnValue(true);

      const result = await startServer(2278520, "C:\\Games\\EnshroudedServer", {
        startupVerifyDelayMs: 0,
      });

      expect(result).toEqual({ success: true });
      const spawnCall = mockSpawn.mock.calls[0];
      expect(spawnCall[0]).toContain("enshrouded_server.exe");
      expect(spawnCall[0]).not.toContain('"');
      expect(spawnCall[1]).toEqual([]);
      expect(spawnCall[2]).toEqual(
        expect.objectContaining({
          cwd: "C:\\Games\\EnshroudedServer",
          detached: true,
          shell: false,
        })
      );
    });

    it("tracks the spawned pid keyed by appId", async () => {
      mockExistsSync.mockReturnValue(true);
      mockSpawn.mockImplementationOnce(
        () =>
          createFakeChild(31337) as unknown as ReturnType<
            typeof childProcess.spawn
          >
      );

      await startServer(2278520, "C:\\Games\\EnshroudedServer", {
        startupVerifyDelayMs: 0,
      });

      expect(getTrackedPid(2278520)).toBe(31337);
    });

    it("untracks the pid when the process later exits", async () => {
      mockExistsSync.mockReturnValue(true);
      const child = createFakeChild(31337);
      mockSpawn.mockImplementationOnce(
        () => child as unknown as ReturnType<typeof childProcess.spawn>
      );

      await startServer(2278520, "C:\\Games\\EnshroudedServer", {
        startupVerifyDelayMs: 0,
      });
      expect(getTrackedPid(2278520)).toBe(31337);

      child.emit("exit", 0, null);

      expect(getTrackedPid(2278520)).toBeUndefined();
    });

    it("returns failure when the process exits within the verify window", async () => {
      mockExistsSync.mockReturnValue(true);
      const child = createFakeChild();
      mockSpawn.mockImplementationOnce(
        () => child as unknown as ReturnType<typeof childProcess.spawn>
      );

      const pending = startServer(2278520, "C:\\Games\\EnshroudedServer", {
        startupVerifyDelayMs: 0,
      });
      child.stderr.emit("data", Buffer.from("bind failed"));
      child.emit("exit", 1, null);

      const result = await pending;

      expect(result.success).toBe(false);
      expect(result.error).toContain("exited");
      expect(result.error).toContain("bind failed");
      expect(getTrackedPid(2278520)).toBeUndefined();
    });

    it("returns failure when spawn errors", async () => {
      mockExistsSync.mockReturnValue(true);
      const child = createFakeChild(undefined);
      mockSpawn.mockImplementationOnce(
        () => child as unknown as ReturnType<typeof childProcess.spawn>
      );

      const pending = startServer(2278520, "C:\\Games\\EnshroudedServer", {
        startupVerifyDelayMs: 0,
      });
      child.emit("error", new Error("EACCES"));

      const result = await pending;

      expect(result.success).toBe(false);
      expect(result.error).toContain("EACCES");
      expect(getTrackedPid(2278520)).toBeUndefined();
    });

    it("returns failure when the process is not detectable after startup", async () => {
      mockExistsSync.mockReturnValue(true);
      mockIsProcessRunning.mockReturnValue(false);

      const result = await startServer(2278520, "C:\\Games\\EnshroudedServer", {
        startupVerifyDelayMs: 0,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("not detectable");
      expect(getTrackedPid(2278520)).toBeUndefined();
    });

    it("spawns the linux-resolved executable for Palworld on linux", async () => {
      const original = setPlatform("linux");
      mockExistsSync.mockReturnValue(true);

      const result = await startServer(1623730, "/opt/steam/PalServer", {
        startupVerifyDelayMs: 0,
      });

      expect(result).toEqual({ success: true });
      expect(mockExistsSync).toHaveBeenCalledWith(
        expect.stringContaining("PalServer.sh")
      );
      const spawnCall = mockSpawn.mock.calls[0];
      expect(spawnCall[0]).toContain("PalServer.sh");
      expect(spawnCall[0]).not.toContain("PalServer.exe");

      restorePlatform(original);
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

    it("kills the tracked pid with process.kill on unix", async () => {
      const original = setPlatform("linux");
      const killSpy = jest
        .spyOn(process, "kill")
        .mockImplementation(() => true);
      mockExistsSync.mockReturnValue(true);
      mockSpawn.mockImplementationOnce(
        () =>
          createFakeChild(31337) as unknown as ReturnType<
            typeof childProcess.spawn
          >
      );
      await startServer(1623730, "/opt/steam/PalServer", {
        startupVerifyDelayMs: 0,
      });

      const result = stopServer(1623730, "/opt/steam/PalServer");

      expect(result).toEqual({ success: true });
      expect(killSpy).toHaveBeenCalledWith(31337, "SIGTERM");
      // Name-based kill must not run when a pid is tracked.
      expect(mockSpawnSync).not.toHaveBeenCalled();
      expect(getTrackedPid(1623730)).toBeUndefined();

      killSpy.mockRestore();
      restorePlatform(original);
    });

    it("kills the tracked pid with taskkill on win32", async () => {
      const original = setPlatform("win32");
      mockExistsSync.mockReturnValue(true);
      mockSpawn.mockImplementationOnce(
        () =>
          createFakeChild(555) as unknown as ReturnType<
            typeof childProcess.spawn
          >
      );
      await startServer(2278520, "C:\\Games\\EnshroudedServer", {
        startupVerifyDelayMs: 0,
      });

      const result = stopServer(2278520, "C:\\Games\\EnshroudedServer");

      expect(result).toEqual({ success: true });
      expect(mockSpawnSync).toHaveBeenCalledWith("taskkill", [
        "/PID",
        "555",
        "/T",
        "/F",
      ]);

      restorePlatform(original);
    });

    it("treats an already-exited tracked pid as success", async () => {
      const original = setPlatform("linux");
      const esrch = new Error("kill ESRCH") as NodeJS.ErrnoException;
      esrch.code = "ESRCH";
      const killSpy = jest.spyOn(process, "kill").mockImplementation(() => {
        throw esrch;
      });
      mockExistsSync.mockReturnValue(true);
      mockSpawn.mockImplementationOnce(
        () =>
          createFakeChild(31337) as unknown as ReturnType<
            typeof childProcess.spawn
          >
      );
      await startServer(1623730, "/opt/steam/PalServer", {
        startupVerifyDelayMs: 0,
      });

      const result = stopServer(1623730, "/opt/steam/PalServer");

      expect(result).toEqual({ success: true });
      expect(getTrackedPid(1623730)).toBeUndefined();

      killSpy.mockRestore();
      restorePlatform(original);
    });

    it("surfaces tracked-pid kill failures", async () => {
      const original = setPlatform("linux");
      const eperm = new Error("kill EPERM") as NodeJS.ErrnoException;
      eperm.code = "EPERM";
      const killSpy = jest.spyOn(process, "kill").mockImplementation(() => {
        throw eperm;
      });
      mockExistsSync.mockReturnValue(true);
      mockSpawn.mockImplementationOnce(
        () =>
          createFakeChild(31337) as unknown as ReturnType<
            typeof childProcess.spawn
          >
      );
      await startServer(1623730, "/opt/steam/PalServer", {
        startupVerifyDelayMs: 0,
      });

      const result = stopServer(1623730, "/opt/steam/PalServer");

      expect(result.success).toBe(false);
      expect(result.error).toContain("EPERM");

      killSpy.mockRestore();
      restorePlatform(original);
    });

    it("falls back to name-based kill when no pid is tracked", () => {
      const original = setPlatform("win32");

      const result = stopServer(2278520, "C:\\Games\\EnshroudedServer");

      expect(result).toEqual({ success: true });
      expect(mockSpawnSync).toHaveBeenCalledWith("taskkill", [
        "/F",
        "/IM",
        "enshrouded_server.exe",
      ]);

      restorePlatform(original);
    });

    it("falls back to the linux-resolved executable for Palworld on linux", () => {
      const original = setPlatform("linux");

      const result = stopServer(1623730, "/opt/steam/PalServer");

      expect(result).toEqual({ success: true });
      expect(mockSpawnSync).toHaveBeenCalledWith("pkill", ["-f", "PalServer"]);

      restorePlatform(original);
    });

    it("surfaces name-based kill failures", () => {
      const original = setPlatform("linux");
      mockSpawnSync.mockReturnValueOnce(spawnSyncResult(2));

      const result = stopServer(1623730, "/opt/steam/PalServer");

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();

      restorePlatform(original);
    });
  });
});
