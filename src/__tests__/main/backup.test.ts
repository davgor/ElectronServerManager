import { promises as fs } from "fs";
import { execSync } from "child_process";

import { backupServerSave } from "../../main/steamDetection";

jest.mock("fs", () => ({
  promises: {
    stat: jest.fn(),
    mkdir: jest.fn(),
  },
}));

jest.mock("child_process", () => ({
  execSync: jest.fn(),
}));

const mockFs = fs as jest.Mocked<typeof fs>;
const mockExecSync = execSync as jest.MockedFunction<typeof execSync>;

describe("backupServerSave", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it("returns null when save directory is missing", async (): Promise<void> => {
    // Simulate save directory missing
    mockFs.stat.mockRejectedValueOnce(new Error("ENOENT") as never);

    const result = await backupServerSave(
      2278520,
      "C:\\Games\\EnshroudedServer",
      "C:\\Backups"
    );

    expect(result).toBeNull();
  });

  it("creates backup successfully on Windows using PowerShell", async (): Promise<void> => {
    // Simulate save directory exists
    mockFs.stat.mockResolvedValueOnce({} as never);
    // mkdir succeeds
    mockFs.mkdir.mockResolvedValueOnce(undefined as never);

    mockExecSync.mockImplementationOnce(() => undefined as never);

    const result = await backupServerSave(
      2278520,
      "C:\\Games\\EnshroudedServer",
      "C:\\Backups"
    );

    // On success we expect a non-null string path to the backup file
    expect(result).not.toBeNull();
    expect(mockExecSync).toHaveBeenCalled();
  });

  it("returns null when zip command fails", async (): Promise<void> => {
    mockFs.stat.mockResolvedValueOnce({} as never);
    mockFs.mkdir.mockResolvedValueOnce(undefined as never);

    mockExecSync.mockImplementationOnce(() => {
      throw new Error("zip failed");
    });

    const result = await backupServerSave(
      2278520,
      "C:\\Games\\EnshroudedServer",
      "C:\\Backups"
    );

    expect(result).toBeNull();
  });

  it("creates backup successfully on Linux using zip command", async (): Promise<void> => {
    // Simulate Linux platform
    const originalPlatform = Object.getOwnPropertyDescriptor(process, "platform");
    Object.defineProperty(process, "platform", { value: "linux", configurable: true });

    mockFs.stat.mockResolvedValueOnce({} as never);
    mockFs.mkdir.mockResolvedValueOnce(undefined as never);
    mockExecSync.mockImplementationOnce(() => undefined as never);

    const result = await backupServerSave(
      2278520,
      "/opt/games/EnshroudedServer",
      "/var/backups"
    );

    expect(result).not.toBeNull();

    // Restore platform
    if (originalPlatform) {
      Object.defineProperty(process, "platform", originalPlatform);
    }
  });

  it("returns null when creating backup directory fails", async (): Promise<void> => {
    mockFs.stat.mockResolvedValueOnce({} as never);
    mockFs.mkdir.mockRejectedValueOnce(new Error("EACCES") as never);

    const result = await backupServerSave(
      2278520,
      "C:\\Games\\EnshroudedServer",
      "C:\\Backups"
    );

    expect(result).toBeNull();
  });
});
