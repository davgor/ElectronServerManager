import { CatalogRepository } from "../../../main/catalog/catalogRepository";
import { openAndMigrateCatalogDb } from "../../../main/catalog/openAndMigrateCatalogDb";

import { ENSHROUDED_SERVER_CONFIG_1_0 } from "./fixtures/enshroudedServerConfig1_0";

const ENSHROUDED_APP_ID = 2278520;
const PALWORLD_APP_ID = 1623730;

/** Every key path in a config, with array indexes written as `*`. */
function collectKeyPaths(value: unknown, prefix: string[] = []): string[] {
  if (value === null || typeof value !== "object") {
    return [];
  }
  const entries = Array.isArray(value)
    ? value.map((item): [string, unknown] => ["*", item])
    : Object.entries(value as Record<string, unknown>);
  const paths: string[] = [];
  for (const [key, child] of entries) {
    const path = [...prefix, key];
    paths.push(path.join("."));
    paths.push(...collectKeyPaths(child, path));
  }
  return [...new Set(paths)];
}

function openRepo(): {
  db: ReturnType<typeof openAndMigrateCatalogDb>;
  repo: CatalogRepository;
} {
  const db = openAndMigrateCatalogDb(":memory:");
  return { db, repo: new CatalogRepository(db) };
}

describe("Enshrouded setting docs (config editor tooltips)", () => {
  it("documents every key of a freshly generated 1.0 enshrouded_server.json", () => {
    const { db, repo } = openRepo();
    try {
      const docs = repo.getSettingDocs(ENSHROUDED_APP_ID);
      const undocumented = collectKeyPaths(ENSHROUDED_SERVER_CONFIG_1_0).filter(
        (path) => !Object.prototype.hasOwnProperty.call(docs, path)
      );
      expect(undocumented).toEqual([]);
    } finally {
      db.close();
    }
  });

  it("only documents keys the 1.0 server config actually has (plus the legacy password)", () => {
    const { db, repo } = openRepo();
    try {
      const known = new Set([
        ...collectKeyPaths(ENSHROUDED_SERVER_CONFIG_1_0),
        "password",
      ]);
      const stray = Object.keys(repo.getSettingDocs(ENSHROUDED_APP_ID)).filter(
        (path) => !known.has(path)
      );
      expect(stray).toEqual([]);
    } finally {
      db.close();
    }
  });

  it("describes the 1.0 additions and marks custom-only gameplay values", () => {
    const { db, repo } = openRepo();
    try {
      const docs = repo.getSettingDocs(ENSHROUDED_APP_ID);
      // Keen's 1.0 readme lists it as a server setting, not a difficulty
      // value, so it makes no claim about the preset.
      expect(docs["gameSettings.flameLevelFogRemoval"]).toBe(
        "Flame level required before Flame Altars can be placed inside the Shroud (new in 1.0). Range: 0–20. Default: 11."
      );
      expect(docs["gameSettings.randomSpawnerAmount"]).toContain("Automatic");
      expect(docs["gameSettings.playerHealthFactor"]).toMatch(
        /Range: 0\.25–4\. Default: 1\. Only used when gameSettingsPreset is "Custom"\.$/
      );
      expect(docs.gameSettingsPreset).not.toContain(
        'Only used when gameSettingsPreset is "Custom"'
      );
      expect(docs["userGroups.*.canKickBan"]).toContain("ban");
      expect(docs["bannedAccounts.*.banDate"]).toContain("Unix timestamp");
    } finally {
      db.close();
    }
  });

  it("states the same default as a freshly generated 1.0 config", () => {
    const { db, repo } = openRepo();
    try {
      const docs = repo.getSettingDocs(ENSHROUDED_APP_ID);
      const defaultPattern =
        /Default(?: in a fresh(?: 1\.0)? config)?: (?:"([^"]+)"|(true|false|-?\d+(?:\.\d+)?))/;
      const mismatches: string[] = [];
      let checked = 0;
      const visit = (value: unknown, path: string[]): void => {
        if (value !== null && typeof value === "object") {
          const entries = Array.isArray(value)
            ? value.map((item): [string, unknown] => ["*", item])
            : Object.entries(value as Record<string, unknown>);
          for (const [key, child] of entries) {
            visit(child, [...path, key]);
          }
          return;
        }
        const doc = docs[path.join(".")] as string | undefined;
        const match = doc === undefined ? null : defaultPattern.exec(doc);
        if (match === null) {
          return;
        }
        checked += 1;
        const [, quoted, bare] = match as unknown as [
          string,
          string | undefined,
          string | undefined,
        ];
        const stated = quoted ?? bare;
        if (stated !== String(value)) {
          mismatches.push(
            `${path.join(".")}: doc ${stated}, config ${String(value)}`
          );
        }
      };
      visit(ENSHROUDED_SERVER_CONFIG_1_0, []);
      expect(mismatches).toEqual([]);
      expect(checked).toBeGreaterThanOrEqual(45);
    } finally {
      db.close();
    }
  });

  it("does not promise open access for an empty role password", () => {
    const { db, repo } = openRepo();
    try {
      const doc =
        repo.getSettingDocs(ENSHROUDED_APP_ID)["userGroups.*.password"];
      expect(doc).not.toMatch(/empty lets anyone join/i);
      expect(doc).toContain("any player");
    } finally {
      db.close();
    }
  });

  it("returns no docs for games without seeded docs or unknown apps", () => {
    const { db, repo } = openRepo();
    try {
      expect(repo.getSettingDocs(PALWORLD_APP_ID)).toEqual({});
      expect(repo.getSettingDocs(9999999)).toEqual({});
    } finally {
      db.close();
    }
  });

  it("returns a copy so callers cannot mutate the cache", () => {
    const { db, repo } = openRepo();
    try {
      const first = repo.getSettingDocs(ENSHROUDED_APP_ID);
      first.name = "tampered";
      expect(repo.getSettingDocs(ENSHROUDED_APP_ID).name).not.toBe("tampered");
    } finally {
      db.close();
    }
  });
});
