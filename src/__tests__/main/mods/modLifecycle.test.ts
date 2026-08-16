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

    expect(fs.readFileSync(path.join(installPath, pakRel), "utf8")).toBe(
      "MODDED"
    );
    expect(
      fs.readFileSync(
        path.join(installPath, "Pal", "Content", "Paks", "new.pak"),
        "utf8"
      )
    ).toBe("NEW");

    const changes = repo.listFileChanges(imported.modId as string);
    const overwritten = changes.find((c) => c.changeType === "overwritten");
    expect(overwritten).toBeTruthy();
    expect(repo.getBackup(overwritten!.id)?.toString("utf8")).toBe("ORIGINAL");

    const removed = removeMod({
      repo,
      paths: { stashRoot },
      modId: imported.modId as string,
    });
    expect(removed.success).toBe(true);
    expect(fs.readFileSync(path.join(installPath, pakRel), "utf8")).toBe(
      "ORIGINAL"
    );
    expect(
      fs.existsSync(path.join(installPath, "Pal", "Content", "Paks", "new.pak"))
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

  it("removes a workshop mod and restores prior PalModSettings when present", () => {
    const settingsDir = path.join(installPath, "Mods");
    fs.mkdirSync(settingsDir, { recursive: true });
    fs.writeFileSync(
      path.join(settingsDir, "PalModSettings.ini"),
      `[PalModSettings]
bGlobalEnableMod=true
ActiveModList=ExistingMod
`
    );

    const info = JSON.stringify({
      ModName: "New One",
      PackageName: "NewOne",
    });
    const zip = makeZip({
      "Info.json": info,
      "Scripts/main.lua": "print(1)",
    });
    const imported = importModZip({
      repo,
      appId: PALWORLD_APP_ID,
      installPath,
      zipBytes: zip,
      sourceZipName: "new.zip",
    });
    expect(imported.success).toBe(true);
    expect(
      listActiveMods(
        fs.readFileSync(
          path.join(installPath, "Mods", "PalModSettings.ini"),
          "utf8"
        )
      )
    ).toEqual(["ExistingMod", "NewOne"]);

    expect(
      removeMod({
        repo,
        paths: { stashRoot },
        modId: imported.modId as string,
      }).success
    ).toBe(true);

    const restored = fs.readFileSync(
      path.join(installPath, "Mods", "PalModSettings.ini"),
      "utf8"
    );
    expect(listActiveMods(restored)).toEqual(["ExistingMod"]);
    expect(restored).toContain("ActiveModList=ExistingMod");
    expect(restored).not.toContain("NewOne");
    expect(
      fs.existsSync(path.join(installPath, "Mods", "Workshop", "NewOne"))
    ).toBe(false);
  });

  it("does not wipe sibling ActiveModList entries when removing an earlier mod", () => {
    const first = importModZip({
      repo,
      appId: PALWORLD_APP_ID,
      installPath,
      zipBytes: makeZip({
        "Info.json": JSON.stringify({
          ModName: "First",
          PackageName: "FirstPkg",
        }),
        "Scripts/a.lua": "a",
      }),
      sourceZipName: "first.zip",
    });
    const second = importModZip({
      repo,
      appId: PALWORLD_APP_ID,
      installPath,
      zipBytes: makeZip({
        "Info.json": JSON.stringify({
          ModName: "Second",
          PackageName: "SecondPkg",
        }),
        "Scripts/b.lua": "b",
      }),
      sourceZipName: "second.zip",
    });
    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    expect(
      listActiveMods(
        fs.readFileSync(
          path.join(installPath, "Mods", "PalModSettings.ini"),
          "utf8"
        )
      )
    ).toEqual(["FirstPkg", "SecondPkg"]);

    expect(
      removeMod({
        repo,
        paths: { stashRoot },
        modId: first.modId as string,
      }).success
    ).toBe(true);

    expect(
      listActiveMods(
        fs.readFileSync(
          path.join(installPath, "Mods", "PalModSettings.ini"),
          "utf8"
        )
      )
    ).toEqual(["SecondPkg"]);
  });

  it("soft-disables and re-enables path_deploy overwrites via stash", () => {
    const pakRel = path.join("Pal", "Content", "Paks", "shared.pak");
    fs.mkdirSync(path.dirname(path.join(installPath, pakRel)), {
      recursive: true,
    });
    fs.writeFileSync(path.join(installPath, pakRel), Buffer.from("ORIGINAL"));

    const imported = importModZip({
      repo,
      appId: PALWORLD_APP_ID,
      installPath,
      zipBytes: makeZip({ "Pal/Content/Paks/shared.pak": "MODDED" }),
      sourceZipName: "ow.zip",
    });
    expect(imported.success).toBe(true);
    const modId = imported.modId as string;
    expect(fs.readFileSync(path.join(installPath, pakRel), "utf8")).toBe(
      "MODDED"
    );

    expect(
      setModEnabled({
        repo,
        paths: { stashRoot },
        modId,
        enabled: false,
      }).success
    ).toBe(true);
    expect(fs.readFileSync(path.join(installPath, pakRel), "utf8")).toBe(
      "ORIGINAL"
    );
    const stashFile = path.join(
      stashRoot,
      modId,
      "Pal",
      "Content",
      "Paks",
      "shared.pak"
    );
    expect(fs.existsSync(stashFile)).toBe(true);
    expect(fs.readFileSync(stashFile, "utf8")).toBe("MODDED");

    expect(
      setModEnabled({
        repo,
        paths: { stashRoot },
        modId,
        enabled: true,
      }).success
    ).toBe(true);
    expect(fs.readFileSync(path.join(installPath, pakRel), "utf8")).toBe(
      "MODDED"
    );
    // Overwrites are copied back (not renamed), so stash still holds modded bytes
    expect(fs.existsSync(stashFile)).toBe(true);
    expect(fs.readFileSync(stashFile, "utf8")).toBe("MODDED");
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
    const modId = imported.modId as string;
    const pak = path.join(installPath, "Pal", "Content", "Paks", "only.pak");
    expect(fs.existsSync(pak)).toBe(true);

    expect(
      setModEnabled({
        repo,
        paths: { stashRoot },
        modId,
        enabled: false,
      }).success
    ).toBe(true);
    expect(fs.existsSync(pak)).toBe(false);
    const stashFile = path.join(
      stashRoot,
      modId,
      "Pal",
      "Content",
      "Paks",
      "only.pak"
    );
    expect(fs.existsSync(stashFile)).toBe(true);

    expect(
      setModEnabled({
        repo,
        paths: { stashRoot },
        modId,
        enabled: true,
      }).success
    ).toBe(true);
    expect(fs.readFileSync(pak, "utf8")).toBe("BYTES");
    // Created files are renamed out of stash on enable
    expect(fs.existsSync(stashFile)).toBe(false);
  });

  it("records settings change_type as overwritten when PalModSettings already exists", () => {
    fs.mkdirSync(path.join(installPath, "Mods"), { recursive: true });
    fs.writeFileSync(
      path.join(installPath, "Mods", "PalModSettings.ini"),
      `[PalModSettings]\nbGlobalEnableMod=false\n`
    );
    const imported = importModZip({
      repo,
      appId: PALWORLD_APP_ID,
      installPath,
      zipBytes: makeZip({
        "Info.json": JSON.stringify({
          ModName: "X",
          PackageName: "PkgX",
        }),
        "Scripts/x.lua": "x",
      }),
      sourceZipName: "x.zip",
    });
    const changes = repo.listFileChanges(imported.modId as string);
    const settingsChange = changes.find(
      (c) => c.relativePath === "Mods/PalModSettings.ini"
    );
    expect(settingsChange?.changeType).toBe("overwritten");
    expect(repo.getBackup(settingsChange!.id)?.toString("utf8")).toContain(
      "bGlobalEnableMod=false"
    );
  });

  it("records settings change_type as settings when PalModSettings is created", () => {
    const imported = importModZip({
      repo,
      appId: PALWORLD_APP_ID,
      installPath,
      zipBytes: makeZip({
        "Info.json": JSON.stringify({
          ModName: "Y",
          PackageName: "PkgY",
        }),
        "Scripts/y.lua": "y",
      }),
      sourceZipName: "y.zip",
    });
    const changes = repo.listFileChanges(imported.modId as string);
    const settingsChange = changes.find(
      (c) => c.relativePath === "Mods/PalModSettings.ini"
    );
    expect(settingsChange?.changeType).toBe("settings");
    expect(repo.getBackup(settingsChange!.id)).toBeNull();
  });

  it("restores corrupted settings from backup on trash when it is the last tracked mod", () => {
    fs.mkdirSync(path.join(installPath, "Mods"), { recursive: true });
    const original = `[PalModSettings]
bGlobalEnableMod=true
ActiveModList=KeepAlive
RestoreToken=ORIGINAL_BACKUP
`;
    fs.writeFileSync(
      path.join(installPath, "Mods", "PalModSettings.ini"),
      original
    );
    const imported = importModZip({
      repo,
      appId: PALWORLD_APP_ID,
      installPath,
      zipBytes: makeZip({
        "Info.json": JSON.stringify({
          ModName: "Temp",
          PackageName: "TempPkg",
        }),
        "Scripts/t.lua": "t",
      }),
      sourceZipName: "temp.zip",
    });
    const modId = imported.modId as string;

    expect(
      setModEnabled({
        repo,
        paths: { stashRoot },
        modId,
        enabled: false,
      }).success
    ).toBe(true);

    // Soft-disable already removed TempPkg; corrupt the file so only BLOB restore
    // can bring RestoreToken back.
    fs.writeFileSync(
      path.join(installPath, "Mods", "PalModSettings.ini"),
      `[PalModSettings]\nbGlobalEnableMod=true\nActiveModList=KeepAlive\n`
    );

    expect(
      removeMod({
        repo,
        paths: { stashRoot },
        modId,
      }).success
    ).toBe(true);

    const restored = fs.readFileSync(
      path.join(installPath, "Mods", "PalModSettings.ini"),
      "utf8"
    );
    expect(restored).toContain("RestoreToken=ORIGINAL_BACKUP");
    expect(listActiveMods(restored)).toEqual(["KeepAlive"]);
    expect(
      fs.existsSync(
        path.join(
          installPath,
          "Mods",
          "Workshop",
          "TempPkg",
          "Scripts",
          "t.lua"
        )
      )
    ).toBe(false);
  });

  it("deletes created PalModSettings.ini when trash removes the last workshop mod", () => {
    const imported = importModZip({
      repo,
      appId: PALWORLD_APP_ID,
      installPath,
      zipBytes: makeZip({
        "Info.json": JSON.stringify({
          ModName: "Solo",
          PackageName: "SoloPkg",
        }),
        "Scripts/s.lua": "s",
      }),
      sourceZipName: "solo.zip",
    });
    const settingsPath = path.join(installPath, "Mods", "PalModSettings.ini");
    expect(fs.existsSync(settingsPath)).toBe(true);
    const stagedLua = path.join(
      installPath,
      "Mods",
      "Workshop",
      "SoloPkg",
      "Scripts",
      "s.lua"
    );
    expect(fs.existsSync(stagedLua)).toBe(true);

    expect(
      removeMod({
        repo,
        paths: { stashRoot },
        modId: imported.modId as string,
      }).success
    ).toBe(true);

    expect(fs.existsSync(settingsPath)).toBe(false);
    expect(fs.existsSync(stagedLua)).toBe(false);
    expect(
      fs.existsSync(path.join(installPath, "Mods", "Workshop", "SoloPkg"))
    ).toBe(false);
  });

  it("on workshop trash, skips settings path and only unlinks created staged files", () => {
    fs.mkdirSync(path.join(installPath, "Mods"), { recursive: true });
    fs.writeFileSync(
      path.join(installPath, "Mods", "PalModSettings.ini"),
      `[PalModSettings]\nbGlobalEnableMod=true\nActiveModList=Keep\nRestoreToken=SAFE\n`
    );
    const imported = importModZip({
      repo,
      appId: PALWORLD_APP_ID,
      installPath,
      zipBytes: makeZip({
        "Info.json": JSON.stringify({
          ModName: "KeepSettings",
          PackageName: "KeepSettingsPkg",
        }),
        "Scripts/k.lua": "k",
      }),
      sourceZipName: "keep.zip",
    });
    const modId = imported.modId as string;

    // Extra created row on settings path: the SETTINGS_REL skip must prevent
    // the created-file unlink pass from deleting the restored settings file.
    repo.insertFileChange({
      modId,
      relativePath: "Mods/PalModSettings.ini",
      changeType: "created",
    });

    // Overwritten file outside the workshop folder must survive the created-only unlink.
    const sideOw = path.join(installPath, "Mods", "side-ow.txt");
    fs.writeFileSync(sideOw, "SIDE_ORIGINAL");
    const owId = repo.insertFileChange({
      modId,
      relativePath: "Mods/side-ow.txt",
      changeType: "overwritten",
    });
    repo.insertBackup(owId, Buffer.from("SIDE_ORIGINAL"));

    const stagedLua = path.join(
      installPath,
      "Mods",
      "Workshop",
      "KeepSettingsPkg",
      "Scripts",
      "k.lua"
    );
    // Missing created file: existsSync guard must keep remove successful.
    fs.unlinkSync(stagedLua);

    expect(
      removeMod({
        repo,
        paths: { stashRoot },
        modId,
      }).success
    ).toBe(true);

    expect(fs.existsSync(sideOw)).toBe(true);
    expect(fs.readFileSync(sideOw, "utf8")).toBe("SIDE_ORIGINAL");
    const settings = fs.readFileSync(
      path.join(installPath, "Mods", "PalModSettings.ini"),
      "utf8"
    );
    expect(settings).toContain("RestoreToken=SAFE");
    expect(listActiveMods(settings)).toEqual(["Keep"]);
  });

  it("rejects path traversal relative paths when applying lifecycle ops", () => {
    const mod = repo.insertMod({
      id: "evil-mod",
      appId: PALWORLD_APP_ID,
      installPath,
      displayName: "Evil",
      packageName: null,
      sourceZipName: "evil.zip",
      kind: "path_deploy",
      enabled: true,
      workshopFolder: null,
    });
    repo.insertFileChange({
      modId: mod.id,
      relativePath: "../outside-escape.txt",
      changeType: "created",
    });
    const outside = path.join(installPath, "..", "outside-escape.txt");
    fs.writeFileSync(outside, "nope");

    const disabled = setModEnabled({
      repo,
      paths: { stashRoot },
      modId: mod.id,
      enabled: false,
    });
    expect(disabled.success).toBe(false);
    expect(disabled.error).toMatch(/outside install path/i);

    fs.rmSync(outside, { force: true });
  });
});
