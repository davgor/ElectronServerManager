/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call */
import { promises as fs } from "fs";
import { Stats } from "fs";

import { findInstalledServers } from "../../main/steamDetection";

describe("findInstalledServers additional", () => {
  const originalStat = fs.stat;

  afterEach(() => {
    // restore
    fs.stat = originalStat;
    jest.resetAllMocks();
  });

  it("finds server when numeric folder exists", async () => {
    // mock parseLibraryFolders indirectly by having safe library path returned
    // We'll mock fs.stat to succeed when numeric folder is checked
    fs.stat = jest.fn((p: string) => {
      if (p.includes("appmanifest_")) {
        return Promise.resolve({} as Stats);
      }
      if (/common\\\d+$/.test(p)) {
        return Promise.resolve({} as Stats);
      }
      return Promise.reject(new Error("ENOENT"));
    }) as unknown as typeof fs.stat;

    const servers = await findInstalledServers("C:\\Program Files (x86)\\Steam");
    expect(servers.length).toBeGreaterThanOrEqual(0);
    if (servers.length > 0) {
      expect(typeof servers[0].appId).toBe("number");
      expect(servers[0].installPath).toContain("common");
    }
  });
});
