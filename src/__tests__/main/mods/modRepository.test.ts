import fs from "fs";
import os from "os";
import path from "path";

import {
  getDefaultModManagerDbPath,
  MOD_MANAGER_SCHEMA_DOC,
  openAndMigrateModManagerDb,
} from "../../../main/mods/modManagerDb";
import { ModRepository } from "../../../main/mods/modRepository";

describe("modManagerDb + ModRepository", () => {
  it("documents schema columns for mods / changes / backups", () => {
    expect(MOD_MANAGER_SCHEMA_DOC.mods.columns).toContain("id");
    expect(MOD_MANAGER_SCHEMA_DOC.mod_file_changes.columns).toContain(
      "change_type"
    );
    expect(MOD_MANAGER_SCHEMA_DOC.mod_file_backups.columns).toContain(
      "content"
    );
  });

  it("opens an in-memory DB and applies migrations", () => {
    const db = openAndMigrateModManagerDb(":memory:");
    const tables = db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`
      )
      .all() as Array<{ name: string }>;
    expect(tables.map((t) => t.name)).toEqual(
      expect.arrayContaining([
        "mods",
        "mod_file_changes",
        "mod_file_backups",
        "schema_migrations",
      ])
    );
    db.close();
  });

  it("uses a deterministic path under userData", () => {
    expect(getDefaultModManagerDbPath("/tmp/userdata")).toBe(
      path.join("/tmp/userdata", "mod-manager.sqlite")
    );
  });

  it("inserts mods, changes, and backup blobs and reads them back", () => {
    const db = openAndMigrateModManagerDb(":memory:");
    const repo = new ModRepository(db);
    const mod = repo.insertMod({
      id: "mod-1",
      appId: 1623730,
      installPath: "/servers/pal",
      displayName: "Test Mod",
      packageName: "TestMod",
      sourceZipName: "test.zip",
      kind: "workshop",
      enabled: true,
      workshopFolder: "Mods/Workshop/TestMod",
    });
    expect(mod.id).toBe("mod-1");

    const changeId = repo.insertFileChange({
      modId: "mod-1",
      relativePath: "Pal/Content/Paks/a.pak",
      changeType: "overwritten",
    });
    const blob = Buffer.from([1, 2, 3, 4]);
    repo.insertBackup(changeId, blob);

    const listed = repo.listMods(1623730, "/servers/pal");
    expect(listed).toHaveLength(1);
    expect(listed[0]?.displayName).toBe("Test Mod");

    const changes = repo.listFileChanges("mod-1");
    expect(changes).toHaveLength(1);
    expect(changes[0]?.changeType).toBe("overwritten");
    expect(repo.getBackup(changeId)?.equals(blob)).toBe(true);

    repo.setEnabled("mod-1", false);
    expect(repo.getMod("mod-1")?.enabled).toBe(false);

    repo.deleteMod("mod-1");
    expect(repo.getMod("mod-1")).toBeNull();
    expect(repo.listFileChanges("mod-1")).toHaveLength(0);
    expect(repo.getBackup(changeId)).toBeNull();
    db.close();
  });

  it("opens a real temp file DB", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "moddb-"));
    const dbPath = path.join(dir, "mod-manager.sqlite");
    const db = openAndMigrateModManagerDb(dbPath);
    expect(fs.existsSync(dbPath)).toBe(true);
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
