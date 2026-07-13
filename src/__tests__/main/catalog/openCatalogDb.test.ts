import fs from "fs";
import os from "os";
import path from "path";

import {
  CATALOG_SCHEMA_DOC,
  getDefaultCatalogDbPath,
  openCatalogDb,
} from "../../../main/catalog/openCatalogDb";

describe("openCatalogDb", () => {
  it("opens an in-memory database", () => {
    const db = openCatalogDb(":memory:");
    try {
      const row = db.prepare("SELECT 1 AS ok").get() as { ok: number };
      expect(row.ok).toBe(1);
    } finally {
      db.close();
    }
  });

  it("opens and creates a file-backed database at a temp path", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "catalog-db-"));
    const dbPath = path.join(dir, "server-catalog.sqlite");
    const db = openCatalogDb(dbPath);
    try {
      expect(fs.existsSync(dbPath)).toBe(true);
      const row = db.prepare("SELECT 1 AS ok").get() as { ok: number };
      expect(row.ok).toBe(1);
    } finally {
      db.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("enables foreign keys", () => {
    const db = openCatalogDb(":memory:");
    try {
      const row = db.pragma("foreign_keys", { simple: true }) as number;
      expect(row).toBe(1);
    } finally {
      db.close();
    }
  });

  it("documents schema columns equivalent to ServerInfo", () => {
    expect(CATALOG_SCHEMA_DOC.servers.columns).toEqual(
      expect.arrayContaining([
        "app_id",
        "name",
        "folder_name",
        "executable",
        "save_location",
        "config_location",
      ])
    );
    expect(CATALOG_SCHEMA_DOC.server_platform_overrides.columns).toEqual(
      expect.arrayContaining([
        "app_id",
        "platform",
        "executable",
        "save_location",
        "config_location",
      ])
    );
    expect(CATALOG_SCHEMA_DOC.server_platform_overrides.platforms).toEqual([
      "win32",
      "linux",
      "darwin",
    ]);
  });

  it("resolves a deterministic path under userData", () => {
    expect(getDefaultCatalogDbPath("/tmp/user-data")).toBe(
      path.join("/tmp/user-data", "server-catalog.sqlite")
    );
  });
});
