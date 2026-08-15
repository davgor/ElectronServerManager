import fs from "fs";
import os from "os";
import path from "path";

import { zipSync } from "fflate";

import { openAndMigrateModManagerDb } from "../../../main/mods/modManagerDb";
import { ModRepository } from "../../../main/mods/modRepository";
import {
  importModZip,
  removeMod,
  setModEnabled,
} from "../../../main/mods/modLifecycle";
import { listActiveMods } from "../../../main/mods/palModSettings";
import { PALWORLD_APP_ID } from "../../../types/ipc";

function makeZip(files: Record<string, string | Uint8Array>): Uint8Array {
  const encoded: Record<string, Uint8Array> = {};
  for (const [name, content] of Object.entries(files)) {
    encoded[name] =
      typeof content === "string" ? Buffer.from(content, "utf8") : content;
  }
  return zipSync(encoded);
}

describe("modLifecycle", () => {
  let installPath: string;
  let stashRoot: string;
  let repo: ModRepository;

  beforeEach(() => {
    installPath = fs.mkdtempSync(path.join(os.tmpdir(), "pal-install-"));
    stashRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pal-stash-"));
    const db = openAndMigrateModManagerDb(":memory:");
    repo = new ModRepository(db);
  });

  afterEach(() => {
    fs.rmSync(installPath, { recursive: true, force: true });
    fs.rmSync(stashRoot, { recursive: true, force: true });
  });

  it("rejects non-Palworld app ids", () => {
    const zip = makeZip({ "Pal/Content/Paks/a.pak": "data" });
    const result = importModZip({
      repo,
      appId: 2278520,
      installPath,
      zipBytes: zip,
      sourceZipName: "a.zip",
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Palworld/i);
  });

  it("imports a path-deploy zip, records overwrite backup, and trash restores it", () => {
    const pakRel = path.join("Pal", "Content", "Paks", "shared.pak");
    fs.mkdirSync(path.dirname(path.join(installPath, pakRel)), {
      recursive: true,
    });
    fs.writeFileSync(path.join(installPath, pakRel), Buffer.from("ORIGINAL"));

    const zip = makeZip({
      "Pal/Content/Paks/shared.pak": "MODDED",
      "Pal/Content/Paks/new.pak": "NEW",
    });

    const imported = importModZip({
      repo,
      appId: PALWORLD_APP_ID,
      installPath,
      zipBytes: zip,
      sourceZipName: "path.zip",
    });
    expect(imported.success).toBe(true);
    expect(imported.modId).toBeTruthy();

    expect(
      fs.readFileSync(path.join(installPath, pakRel), "utf8")
    ).toBe("MODDED");
    expect(
      fs.readFileSync(
        path.join(installPath, "Pal", "Content", "Paks", "new.pak"),
        "utf8"
      )
    ).toBe("NEW");

    const changes = repo.listFileChanges(imported.modId as string);
    const overwritten = changes.find((c) => c.changeType === "overwritten");
    expect(overwritten).toBeTruthy();
    expect(
      repo.getBackup(overwritten!.id)?.toString("utf8")
    ).toBe("ORIGINAL");

    const removed = removeMod({
      repo,
      paths: { stashRoot },
      modId: imported.modId as string,
    });
    expect(removed.success).toBe(true);
    expect(
      fs.readFileSync(path.join(installPath, pakRel), "utf8")
    ).toBe("ORIGINAL");
    expect(
      fs.existsSync(
        path.join(installPath, "Pal", "Content", "Paks", "new.pak")
      )
    ).toBe(false);
    expect(repo.getMod(imported.modId as string)).toBeNull();
  });

  it("imports a workshop package, auto-enables in PalModSettings, disable soft-removes", () => {
    const info = JSON.stringify({
      ModName: "Server Lua",
      PackageName: "ServerLua",
      InstallRule: [{ Type: "Lua", IsServer: true, Targets: ["./Scripts"] }],
    });
    const zip = makeZip({
      "Info.json": info,
      "Scripts/main.lua": "print('hi')",
    });

    const imported = importModZip({
      repo,
      appId: PALWORLD_APP_ID,
      installPath,
      zipBytes: zip,
      sourceZipName: "workshop.zip",
    });
    expect(imported.success).toBe(true);

    const staged = path.join(
      installPath,
      "Mods",
      "Workshop",
      "ServerLua",
      "Info.json"
    );
    expect(fs.existsSync(staged)).toBe(true);

    const settings = fs.readFileSync(
      path.join(installPath, "Mods", "PalModSettings.ini"),
      "utf8"
    );
    expect(listActiveMods(settings)).toEqual(["ServerLua"]);

    const disabled = setModEnabled({
      repo,
      paths: { stashRoot },
      modId: imported.modId as string,
      enabled: false,
    });
    expect(disabled.success).toBe(true);
    expect(
      listActiveMods(
        fs.readFileSync(
          path.join(installPath, "Mods", "PalModSettings.ini"),
          "utf8"
        )
      )
    ).toEqual([]);
    // Staging remains for soft disable
    expect(fs.existsSync(staged)).toBe(true);

    const enabled = setModEnabled({
      repo,
      paths: { stashRoot },
      modId: imported.modId as string,
      enabled: true,
    });
    expect(enabled.success).toBe(true);
    expect(
      listActiveMods(
        fs.readFileSync(
          path.join(installPath, "Mods", "PalModSettings.ini"),
          "utf8"
        )
      )
    ).toEqual(["ServerLua"]);

    const removed = removeMod({
      repo,
      paths: { stashRoot },
      modId: imported.modId as string,
    });
    expect(removed.success).toBe(true);
    expect(
      fs.existsSync(path.join(installPath, "Mods", "Workshop", "ServerLua"))
    ).toBe(false);
  });

  it("soft-disables path_deploy mods and re-enables from stash", () => {
    const zip = makeZip({ "Pal/Content/Paks/only.pak": "BYTES" });
    const imported = importModZip({
      repo,
      appId: PALWORLD_APP_ID,
      installPath,
      zipBytes: zip,
      sourceZipName: "only.zip",
    });
    const pak = path.join(installPath, "Pal", "Content", "Paks", "only.pak");
    expect(fs.existsSync(pak)).toBe(true);

    expect(
      setModEnabled({
        repo,
        paths: { stashRoot },
        modId: imported.modId as string,
        enabled: false,
      }).success
    ).toBe(true);
    expect(fs.existsSync(pak)).toBe(false);

    expect(
      setModEnabled({
        repo,
        paths: { stashRoot },
        modId: imported.modId as string,
        enabled: true,
      }).success
    ).toBe(true);
    expect(fs.readFileSync(pak, "utf8")).toBe("BYTES");
  });
});
