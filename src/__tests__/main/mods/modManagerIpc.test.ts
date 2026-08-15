import fs from "fs";
import os from "os";
import path from "path";

import { zipSync } from "fflate";

import { initModManager } from "../../../main/mods/initModManager";
import {
  listServerMods,
  removeServerMod,
  selectAndImportModZip,
  setServerModEnabled,
} from "../../../main/mods/modManagerIpc";
import { PALWORLD_APP_ID } from "../../../types/ipc";

function makeZip(files: Record<string, string>): Uint8Array {
  const encoded: Record<string, Uint8Array> = {};
  for (const [name, content] of Object.entries(files)) {
    encoded[name] = Buffer.from(content, "utf8");
  }
  return zipSync(encoded);
}

describe("initModManager + modManagerIpc", () => {
  let userData: string;
  let installPath: string;

  beforeEach(() => {
    userData = fs.mkdtempSync(path.join(os.tmpdir(), "mod-userdata-"));
    installPath = fs.mkdtempSync(path.join(os.tmpdir(), "mod-install-"));
    initModManager(userData);
  });

  afterEach(() => {
    fs.rmSync(userData, { recursive: true, force: true });
    fs.rmSync(installPath, { recursive: true, force: true });
  });

  it("lists empty mods for a Palworld install", () => {
    const result = listServerMods(PALWORLD_APP_ID, installPath);
    expect(result.success).toBe(true);
    expect(result.mods).toEqual([]);
  });

  it("rejects list for non-Palworld", () => {
    const result = listServerMods(2278520, installPath);
    expect(result.success).toBe(false);
    expect(result.mods).toEqual([]);
  });

  it("imports via selectAndImportModZip when dialog returns a zip", async () => {
    const zipPath = path.join(userData, "mod.zip");
    fs.writeFileSync(
      zipPath,
      makeZip({
        "Info.json": JSON.stringify({
          ModName: "IPC Mod",
          PackageName: "IpcMod",
        }),
        "Scripts/a.lua": "--",
      })
    );

    const result = await selectAndImportModZip(
      PALWORLD_APP_ID,
      installPath,
      () => ({}) as never,
      {
        showOpenDialog: () =>
          Promise.resolve({
            canceled: false,
            filePaths: [zipPath],
          }),
      },
      (filePath) => fs.readFileSync(filePath)
    );

    expect(result.success).toBe(true);
    expect(result.mod?.packageName).toBe("IpcMod");
    expect(result.mod?.enabled).toBe(true);

    const listed = listServerMods(PALWORLD_APP_ID, installPath);
    expect(listed.mods).toHaveLength(1);

    const disabled = setServerModEnabled(listed.mods[0].id, false);
    expect(disabled.success).toBe(true);
    expect(listServerMods(PALWORLD_APP_ID, installPath).mods[0]?.enabled).toBe(
      false
    );

    const removed = removeServerMod(listed.mods[0].id);
    expect(removed.success).toBe(true);
    expect(listServerMods(PALWORLD_APP_ID, installPath).mods).toHaveLength(0);
  });

  it("returns canceled when the file picker is dismissed", async () => {
    const result = await selectAndImportModZip(
      PALWORLD_APP_ID,
      installPath,
      () => ({}) as never,
      {
        showOpenDialog: () =>
          Promise.resolve({ canceled: true, filePaths: [] }),
      },
      () => Buffer.alloc(0)
    );
    expect(result.canceled).toBe(true);
    expect(result.success).toBe(false);
  });

  it("rejects import for non-Palworld", async () => {
    const result = await selectAndImportModZip(
      1,
      installPath,
      () => ({}) as never,
      {
        showOpenDialog: () =>
          Promise.resolve({
            canceled: false,
            filePaths: ["/x.zip"],
          }),
      },
      () => Buffer.alloc(0)
    );
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Palworld/i);
  });

  it("errors when main window is unavailable", async () => {
    const result = await selectAndImportModZip(
      PALWORLD_APP_ID,
      installPath,
      () => null,
      {
        showOpenDialog: () =>
          Promise.resolve({
            canceled: false,
            filePaths: ["/x.zip"],
          }),
      },
      () => Buffer.alloc(0)
    );
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/window/i);
  });
});
