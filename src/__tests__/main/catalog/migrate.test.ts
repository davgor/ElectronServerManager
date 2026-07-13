import type { CatalogDb } from "../../../main/catalog/openCatalogDb";
import { openCatalogDb } from "../../../main/catalog/openCatalogDb";
import { migrateCatalogDb } from "../../../main/catalog/migrate";
import type { CatalogMigration } from "../../../main/catalog/migrations/types";

function listMigrationVersions(db: CatalogDb): number[] {
  return (
    db
      .prepare("SELECT version FROM schema_migrations ORDER BY version")
      .all() as Array<{
      version: number;
    }>
  ).map((row) => row.version);
}

describe("migrateCatalogDb", () => {
  it("applies pending migrations on an empty database", () => {
    const db = openCatalogDb(":memory:");
    try {
      const migrations: CatalogMigration[] = [
        {
          version: 1,
          name: "create_flag_table",
          up(database) {
            database.exec("CREATE TABLE flag (id INTEGER PRIMARY KEY)");
          },
        },
        {
          version: 2,
          name: "insert_flag",
          up(database) {
            database.exec("INSERT INTO flag (id) VALUES (1)");
          },
        },
      ];

      migrateCatalogDb(db, migrations);

      expect(listMigrationVersions(db)).toEqual([1, 2]);
      const row = db.prepare("SELECT id FROM flag").get() as { id: number };
      expect(row.id).toBe(1);
    } finally {
      db.close();
    }
  });

  it("skips already-applied migrations on re-open", () => {
    const db = openCatalogDb(":memory:");
    try {
      let applyCount = 0;
      const migrations: CatalogMigration[] = [
        {
          version: 1,
          name: "once",
          up(database) {
            applyCount += 1;
            database.exec("CREATE TABLE once (id INTEGER PRIMARY KEY)");
          },
        },
      ];

      migrateCatalogDb(db, migrations);
      migrateCatalogDb(db, migrations);

      expect(applyCount).toBe(1);
      expect(listMigrationVersions(db)).toEqual([1]);
    } finally {
      db.close();
    }
  });

  it("fails loudly and does not record a failed migration", () => {
    const db = openCatalogDb(":memory:");
    try {
      const migrations: CatalogMigration[] = [
        {
          version: 1,
          name: "ok",
          up(database) {
            database.exec("CREATE TABLE ok (id INTEGER PRIMARY KEY)");
          },
        },
        {
          version: 2,
          name: "boom",
          up() {
            throw new Error("deliberate migration failure");
          },
        },
      ];

      expect(() => migrateCatalogDb(db, migrations)).toThrow(
        /migration 2 \(boom\).*deliberate migration failure/i
      );
      expect(listMigrationVersions(db)).toEqual([1]);
      expect(
        db
          .prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='ok'"
          )
          .get()
      ).toBeDefined();
    } finally {
      db.close();
    }
  });
});
