import { promises as fs } from "fs";
import path from "path";

import {
  buildManifestCandidatePaths,
  getServerBuildId,
} from "../../main/steamDetection";

jest.mock("fs", () => ({
  promises: {
    readFile: jest.fn(),
    stat: jest.fn(),
  },
}));

const mockFs = fs as jest.Mocked<typeof fs>;

const APP_ID = 999999;
const MANIFEST = `appmanifest_${APP_ID}.acf`;

/** Resolve readFile per-path so candidate ordering is explicit in each test. */
function mockManifestFiles(files: Record<string, string | undefined>): void {
  mockFs.readFile.mockImplementation((requestedPath) => {
    const content = files[String(requestedPath)];
    if (content === undefined) {
      return Promise.reject(new Error("ENOENT"));
    }
    return Promise.resolve(content as never);
  });
}

describe("buildManifestCandidatePaths", () => {
  it("prefers manifests owned by the library that contains installPath", () => {
    const installPath = path.join(
      "/library2",
      "steamapps",
      "common",
      "PalServer"
    );

    const candidates = buildManifestCandidatePaths(
      APP_ID,
      "/steam-root",
      installPath
    );

    expect(candidates).toEqual([
      // steamcmd force_install_dir writes its manifest inside the install
      path.join(installPath, "steamapps", MANIFEST),
      // the Steam library that owns the install dir
      path.join("/library2", "steamapps", MANIFEST),
      // steam root layouts (production passes the Steam install root)
      path.join("/steam-root", "steamapps", MANIFEST),
      path.join("/steam-root", MANIFEST),
    ]);
  });

  it("deduplicates candidates when the install lives under the steam root", () => {
    const installPath = path.join(
      "/steam-root",
      "steamapps",
      "common",
      "EnshroudedServer"
    );

    const candidates = buildManifestCandidatePaths(
      APP_ID,
      "/steam-root",
      installPath
    );

    expect(candidates).toEqual([
      path.join(installPath, "steamapps", MANIFEST),
      path.join("/steam-root", "steamapps", MANIFEST),
      path.join("/steam-root", MANIFEST),
    ]);
  });

  it("supports a steamapps directory passed directly without installPath", () => {
    const candidates = buildManifestCandidatePaths(
      APP_ID,
      path.join("/steam-root", "steamapps")
    );

    expect(candidates).toEqual([
      path.join("/steam-root", "steamapps", "steamapps", MANIFEST),
      path.join("/steam-root", "steamapps", MANIFEST),
    ]);
  });
});

describe("getServerBuildId", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it("reads the manifest of the library that contains installPath", async (): Promise<void> => {
    const installPath = path.join(
      "/library2",
      "steamapps",
      "common",
      "PalServer"
    );
    const libraryManifest = path.join("/library2", "steamapps", MANIFEST);
    mockManifestFiles({ [libraryManifest]: '"buildid" "222222"' });

    const result = await getServerBuildId(APP_ID, "/steam-root", installPath);

    expect(result).toBe("222222");
    expect(mockFs.readFile).toHaveBeenCalledWith(libraryManifest, "utf8");
  });

  it("prefers the steamcmd manifest inside the install over the library manifest", async (): Promise<void> => {
    const installPath = path.join(
      "/library2",
      "steamapps",
      "common",
      "PalServer"
    );
    mockManifestFiles({
      [path.join(installPath, "steamapps", MANIFEST)]: '"buildid" "333333"',
      [path.join("/library2", "steamapps", MANIFEST)]: '"buildid" "111111"',
    });

    const result = await getServerBuildId(APP_ID, "/steam-root", installPath);

    expect(result).toBe("333333");
  });

  it("falls back to the steam root steamapps manifest when no library manifest exists", async (): Promise<void> => {
    const installPath = path.join("/somewhere", "else", "PalServer");
    mockManifestFiles({
      [path.join("/steam-root", "steamapps", MANIFEST)]: '"buildid" "444444"',
    });

    const result = await getServerBuildId(APP_ID, "/steam-root", installPath);

    expect(result).toBe("444444");
  });

  it("still resolves when steamPath is already a steamapps directory (legacy)", async (): Promise<void> => {
    const steamAppsDir = "C:\\Steam\\steamapps";
    mockManifestFiles({
      [path.join(steamAppsDir, MANIFEST)]: '"buildid" "123456"',
    });

    const result = await getServerBuildId(APP_ID, steamAppsDir);

    expect(result).toBe("123456");
    expect(mockFs.readFile).toHaveBeenCalledWith(
      path.join(steamAppsDir, MANIFEST),
      "utf8"
    );
  });

  it("skips manifests without a buildid and uses the next candidate", async (): Promise<void> => {
    const installPath = path.join(
      "/library2",
      "steamapps",
      "common",
      "PalServer"
    );
    mockManifestFiles({
      [path.join(installPath, "steamapps", MANIFEST)]: '"appid" "999999"',
      [path.join("/library2", "steamapps", MANIFEST)]: '"buildid" "555555"',
    });

    const result = await getServerBuildId(APP_ID, "/steam-root", installPath);

    expect(result).toBe("555555");
  });

  it("returns null when no candidate manifest contains a buildid", async (): Promise<void> => {
    mockManifestFiles({
      [path.join("/steam-root", "steamapps", MANIFEST)]: '"appid" "999999"',
    });

    const result = await getServerBuildId(
      APP_ID,
      "/steam-root",
      path.join("/library2", "steamapps", "common", "PalServer")
    );

    expect(result).toBeNull();
  });

  it("returns null when no candidate manifest exists", async (): Promise<void> => {
    mockManifestFiles({});

    const result = await getServerBuildId(APP_ID, "/steam-root");

    expect(result).toBeNull();
  });
});
