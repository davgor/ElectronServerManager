import type { ModInstallKind } from "./zipDestination";
import type { ModManagerDb } from "./modManagerDb";

export type ModFileChangeType = "created" | "overwritten" | "settings";

export interface ModRecord {
  id: string;
  appId: number;
  installPath: string;
  displayName: string;
  packageName: string | null;
  sourceZipName: string | null;
  kind: ModInstallKind;
  enabled: boolean;
  workshopFolder: string | null;
  importedAt: string;
}

export interface ModFileChangeRecord {
  id: number;
  modId: string;
  relativePath: string;
  changeType: ModFileChangeType;
}

export interface InsertModInput {
  id: string;
  appId: number;
  installPath: string;
  displayName: string;
  packageName: string | null;
  sourceZipName: string | null;
  kind: ModInstallKind;
  enabled: boolean;
  workshopFolder: string | null;
  importedAt?: string;
}

interface ModRow {
  id: string;
  app_id: number;
  install_path: string;
  display_name: string;
  package_name: string | null;
  source_zip_name: string | null;
  kind: ModInstallKind;
  enabled: number;
  workshop_folder: string | null;
  imported_at: string;
}

interface ChangeRow {
  id: number;
  mod_id: string;
  relative_path: string;
  change_type: ModFileChangeType;
}

function mapMod(row: ModRow): ModRecord {
  return {
    id: row.id,
    appId: row.app_id,
    installPath: row.install_path,
    displayName: row.display_name,
    packageName: row.package_name,
    sourceZipName: row.source_zip_name,
    kind: row.kind,
    enabled: row.enabled === 1,
    workshopFolder: row.workshop_folder,
    importedAt: row.imported_at,
  };
}

function mapChange(row: ChangeRow): ModFileChangeRecord {
  return {
    id: row.id,
    modId: row.mod_id,
    relativePath: row.relative_path,
    changeType: row.change_type,
  };
}

export class ModRepository {
  constructor(private readonly db: ModManagerDb) {}

  insertMod(input: InsertModInput): ModRecord {
    const importedAt = input.importedAt ?? new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO mods (
          id, app_id, install_path, display_name, package_name, source_zip_name,
          kind, enabled, workshop_folder, imported_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.id,
        input.appId,
        input.installPath,
        input.displayName,
        input.packageName,
        input.sourceZipName,
        input.kind,
        input.enabled ? 1 : 0,
        input.workshopFolder,
        importedAt
      );
    const mod = this.getMod(input.id);
    if (!mod) {
      throw new Error("Failed to insert mod");
    }
    return mod;
  }

  getMod(id: string): ModRecord | null {
    const row = this.db
      .prepare(`SELECT * FROM mods WHERE id = ?`)
      .get(id) as ModRow | undefined;
    return row ? mapMod(row) : null;
  }

  listMods(appId: number, installPath: string): ModRecord[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM mods WHERE app_id = ? AND install_path = ? ORDER BY imported_at ASC`
      )
      .all(appId, installPath) as ModRow[];
    return rows.map(mapMod);
  }

  setEnabled(id: string, enabled: boolean): void {
    this.db
      .prepare(`UPDATE mods SET enabled = ? WHERE id = ?`)
      .run(enabled ? 1 : 0, id);
  }

  deleteMod(id: string): void {
    this.db.prepare(`DELETE FROM mods WHERE id = ?`).run(id);
  }

  insertFileChange(input: {
    modId: string;
    relativePath: string;
    changeType: ModFileChangeType;
  }): number {
    const result = this.db
      .prepare(
        `INSERT INTO mod_file_changes (mod_id, relative_path, change_type)
         VALUES (?, ?, ?)`
      )
      .run(input.modId, input.relativePath, input.changeType);
    return Number(result.lastInsertRowid);
  }

  listFileChanges(modId: string): ModFileChangeRecord[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM mod_file_changes WHERE mod_id = ? ORDER BY id ASC`
      )
      .all(modId) as ChangeRow[];
    return rows.map(mapChange);
  }

  insertBackup(changeId: number, content: Buffer): void {
    this.db
      .prepare(
        `INSERT INTO mod_file_backups (change_id, content) VALUES (?, ?)`
      )
      .run(changeId, content);
  }

  getBackup(changeId: number): Buffer | null {
    const row = this.db
      .prepare(`SELECT content FROM mod_file_backups WHERE change_id = ?`)
      .get(changeId) as { content: Buffer } | undefined;
    return row ? Buffer.from(row.content) : null;
  }
}
