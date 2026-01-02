import { promises as fs } from "fs";
import path from "path";

import { getServerBuildId } from "../../main/steamDetection";

jest.mock("fs", () => ({
  promises: {
    readFile: jest.fn(),
    stat: jest.fn(),
  },
}));

const mockFs = fs as jest.Mocked<typeof fs>;

describe("getServerBuildId", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it("returns build id string when manifest contains buildid", async (): Promise<void> => {
    const fakeManifest = '"buildid" "123456"';
    mockFs.readFile.mockResolvedValueOnce(fakeManifest as never);

    const result = await getServerBuildId(999999, "C:\\Steam\\steamapps");

    expect(result).toBe("123456");
    expect(mockFs.readFile).toHaveBeenCalledWith(
      path.join("C:\\Steam\\steamapps", "appmanifest_999999.acf"),
      "utf8"
    );
  });

  it("returns null when manifest does not contain buildid", async (): Promise<void> => {
    const fakeManifest = '"appid" "999999"';
    mockFs.readFile.mockResolvedValueOnce(fakeManifest as never);

    const result = await getServerBuildId(999999, "C:\\Steam\\steamapps");

    expect(result).toBeNull();
  });

  it("returns null when reading the manifest fails", async (): Promise<void> => {
    mockFs.readFile.mockRejectedValueOnce(new Error("ENOENT") as never);

    const result = await getServerBuildId(999999, "C:\\Steam\\steamapps");

    expect(result).toBeNull();
  });
});
