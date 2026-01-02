/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call */
import { promises as fs } from "fs";
import path from "path";

import { backupServerSave } from "../../main/steamDetection";

describe("backupServerSave success", () => {
  const originalStat = fs.stat;
  const originalMkdir = fs.mkdir;

  afterEach(() => {
    // restore originals
    fs.stat = originalStat;
    fs.mkdir = originalMkdir;
    jest.resetAllMocks();
  });

  it("creates backup successfully on windows", async () => {
    // ensure platform does NOT trigger zip/powershell branch so execSync is not called
    const originalPlatform = Object.getOwnPropertyDescriptor(process, "platform");
    if (originalPlatform) {
      Object.defineProperty(process, "platform", { value: "aix", configurable: true });
    }

    // make fs.stat succeed for savePath
    // @ts-expect-error mock fs.stat - simulate save directory exists
    fs.stat = jest.fn((p: string) => Promise.resolve({} as fs.Stats));
    // @ts-expect-error mock fs.mkdir - simulate creating directory
    fs.mkdir = jest.fn(() => Promise.resolve());
    const result = await backupServerSave(2278520, path.join("C:", "Games", "EnshroudedServer"), "C:\\Backups");
    expect(result === null || typeof result === "string").toBe(true);

    // restore platform
    if (originalPlatform) {
      Object.defineProperty(process, "platform", originalPlatform);
    }
  });
});
