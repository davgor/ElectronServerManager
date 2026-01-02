/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call */
import { promises as fs } from "fs";

import { parseLibraryFolders } from "../../main/steamDetection";

describe("parseLibraryFolders", () => {
  const originalReadFile = fs.readFile;

  afterEach(() => {
    // restore mock
    // Reason: restoring a mocked function to the original signature for other tests
    fs.readFile = originalReadFile;
    jest.resetAllMocks();
  });

  it("parses multiple library paths from libraryfolders.vdf", async () => {
      const fakeContent = `"path" "D:\\Games\\Steam"\n"path" "E:\\MoreSteam"`;
      // @ts-expect-error mock fs.readFile - mocking file read in test
      // Reason: replacing readFile with a test double
      fs.readFile = jest.fn(() => Promise.resolve(fakeContent));

    const result = await parseLibraryFolders("C:\\Program Files (x86)\\Steam");

    expect(result.length).toBeGreaterThanOrEqual(1);
    const joined = (result as unknown as string[]).join(";");
    expect(joined).toContain("D:\\Games\\Steam");
    expect(joined).toContain("E:\\MoreSteam");
  });

  it("returns default steamapps when library file missing", async () => {
    // @ts-expect-error mock fs.readFile to throw - simulate missing file
    // Reason: replacing readFile with a test double that throws
    fs.readFile = jest.fn(() => Promise.reject(new Error("ENOENT")));

    const result = await parseLibraryFolders("C:\\Program Files (x86)\\Steam");
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect((result as unknown as string[])[0]).toContain("steamapps");
  });
});
