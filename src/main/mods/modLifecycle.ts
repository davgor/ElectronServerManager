import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";

import { PALWORLD_APP_ID } from "../../types/ipc";

import type { ModRecord, ModRepository } from "./modRepository";
import { addActiveMod, removeActiveMod } from "./palModSettings";
import { readZipEntries } from "./readZip";
import { resolveZipDestination, type ZipInstallPlan } from "./zipDestination";

const SETTINGS_REL = "Mods/PalModSettings.ini";

interface ModActionResult {
  success: boolean;
  error?: string;
  modId?: string;
}

export interface ModManagerPaths {
  /** Root for soft-disabled path_deploy file stash. */
  stashRoot: string;
}

function assertPalworld(appId: number): string | null {
  if (appId !== PALWORLD_APP_ID) {
    return "Mod manager is only available for Palworld dedicated servers";
  }
  return null;
}

function absUnderInstall(installPath: string, relativePosix: string): string {
  const abs = path.resolve(installPath, ...relativePosix.split("/"));
  const root = path.resolve(installPath);
  if (abs !== root && !abs.startsWith(root + path.sep)) {
    throw new Error(`Refusing to write outside install path: ${relativePosix}`);
  }
  return abs;
}

function ensureParent(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function settingsAbs(installPath: string): string {
  return path.join(installPath, "Mods", "PalModSettings.ini");
}

function readSettingsText(installPath: string): string {
  const p = settingsAbs(installPath);
  if (!fs.existsSync(p)) {
    return "";
  }
  return fs.readFileSync(p, "utf8");
}

function writeSettingsText(installPath: string, content: string): void {
  const p = settingsAbs(installPath);
  ensureParent(p);
  fs.writeFileSync(p, content, "utf8");
}

function stashDir(paths: ModManagerPaths, modId: string): string {
  return path.join(paths.stashRoot, modId);
}

function deployFile(
  repo: ModRepository,
  modId: string,
  installPath: string,
  relativeTarget: string,
  bytes: Buffer
): void {
  const abs = absUnderInstall(installPath, relativeTarget);
  if (fs.existsSync(abs)) {
    const previous = fs.readFileSync(abs);
    const changeId = repo.insertFileChange({
      modId,
      relativePath: relativeTarget,
      changeType: "overwritten",
    });
    repo.insertBackup(changeId, previous);
  } else {
    repo.insertFileChange({
      modId,
      relativePath: relativeTarget,
      changeType: "created",
    });
  }
  ensureParent(abs);
  fs.writeFileSync(abs, bytes);
}

function workshopFileRel(folderName: string, fileRel: string): string {
  return ["Mods", "Workshop", folderName, ...fileRel.split("/")].join("/");
}

function importWorkshop(
  repo: ModRepository,
  modId: string,
  options: { appId: number; installPath: string; sourceZipName: string },
  plan: ZipInstallPlan,
  entries: Record<string, Buffer>
): void {
  const folderName = plan.workshopFolderName ?? plan.packageName ?? modId;
  const workshopFolder = ["Mods", "Workshop", folderName].join("/");

  repo.insertMod({
    id: modId,
    appId: options.appId,
    installPath: options.installPath,
    displayName: plan.displayName,
    packageName: plan.packageName,
    sourceZipName: options.sourceZipName,
    kind: "workshop",
    enabled: true,
    workshopFolder,
  });

  for (const file of plan.files) {
    if (!Object.prototype.hasOwnProperty.call(entries, file.archivePath)) {
      throw new Error(`Missing zip entry: ${file.archivePath}`);
    }
    const bytes = entries[file.archivePath];
    deployFile(
      repo,
      modId,
      options.installPath,
      workshopFileRel(folderName, file.relativeTarget),
      bytes
    );
  }

  if (plan.packageName === null || plan.packageName === "") {
    throw new Error("Workshop package is missing PackageName");
  }

  const before = readSettingsText(options.installPath);
  const beforeExisted = fs.existsSync(settingsAbs(options.installPath));
  if (beforeExisted) {
    const changeId = repo.insertFileChange({
      modId,
      relativePath: SETTINGS_REL,
      changeType: "overwritten",
    });
    repo.insertBackup(changeId, Buffer.from(before, "utf8"));
  } else {
    repo.insertFileChange({
      modId,
      relativePath: SETTINGS_REL,
      changeType: "settings",
    });
  }
  writeSettingsText(
    options.installPath,
    addActiveMod(before, plan.packageName)
  );
}

function importPathDeploy(
  repo: ModRepository,
  modId: string,
  options: { appId: number; installPath: string; sourceZipName: string },
  plan: ZipInstallPlan,
  entries: Record<string, Buffer>
): void {
  repo.insertMod({
    id: modId,
    appId: options.appId,
    installPath: options.installPath,
    displayName: plan.displayName,
    packageName: plan.packageName,
    sourceZipName: options.sourceZipName,
    kind: "path_deploy",
    enabled: true,
    workshopFolder: null,
  });

  for (const file of plan.files) {
    if (!Object.prototype.hasOwnProperty.call(entries, file.archivePath)) {
      throw new Error(`Missing zip entry: ${file.archivePath}`);
    }
    const bytes = entries[file.archivePath];
    deployFile(repo, modId, options.installPath, file.relativeTarget, bytes);
  }
}

export function importModZip(options: {
  repo: ModRepository;
  appId: number;
  installPath: string;
  zipBytes: Uint8Array;
  sourceZipName: string;
}): ModActionResult {
  const gate = assertPalworld(options.appId);
  if (gate !== null) {
    return { success: false, error: gate };
  }

  let entries: Record<string, Buffer>;
  try {
    entries = readZipEntries(options.zipBytes);
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to read zip",
    };
  }

  const resolve = resolveZipDestination(
    Object.keys(entries).map((p) => ({ path: p })),
    entries
  );
  if (!resolve.ok) {
    return { success: false, error: resolve.error };
  }

  const modId = randomUUID();
  try {
    if (resolve.plan.kind === "workshop") {
      importWorkshop(options.repo, modId, options, resolve.plan, entries);
    } else {
      importPathDeploy(options.repo, modId, options, resolve.plan, entries);
    }
  } catch (error) {
    try {
      options.repo.deleteMod(modId);
    } catch {
      // ignore cleanup errors
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  return { success: true, modId };
}

/**
 * Soft-remove path_deploy files from the game tree.
 * Created files and current (modded) overwrite bytes are moved/copied to stash;
 * overwritten originals are restored from SQLite BLOBs.
 */
function softRemovePathDeploy(
  repo: ModRepository,
  paths: ModManagerPaths,
  mod: ModRecord
): void {
  const changes = repo.listFileChanges(mod.id);
  const stash = stashDir(paths, mod.id);
  fs.mkdirSync(stash, { recursive: true });

  for (const change of changes) {
    if (change.changeType === "settings") {
      continue;
    }
    const abs = absUnderInstall(mod.installPath, change.relativePath);
    if (!fs.existsSync(abs)) {
      continue;
    }
    const dest = path.join(stash, ...change.relativePath.split("/"));
    ensureParent(dest);
    if (change.changeType === "overwritten") {
      fs.copyFileSync(abs, dest);
    } else {
      fs.renameSync(abs, dest);
    }
  }

  for (const change of [...changes].reverse()) {
    if (change.changeType !== "overwritten") {
      continue;
    }
    const backup = repo.getBackup(change.id);
    if (!backup) {
      continue;
    }
    const abs = absUnderInstall(mod.installPath, change.relativePath);
    ensureParent(abs);
    fs.writeFileSync(abs, backup);
  }
}

function restorePathDeployFromStash(
  repo: ModRepository,
  paths: ModManagerPaths,
  mod: ModRecord
): void {
  const changes = repo.listFileChanges(mod.id);
  const stash = stashDir(paths, mod.id);

  for (const change of changes) {
    if (change.changeType === "settings") {
      continue;
    }
    const stashed = path.join(stash, ...change.relativePath.split("/"));
    if (!fs.existsSync(stashed)) {
      continue;
    }
    const abs = absUnderInstall(mod.installPath, change.relativePath);
    ensureParent(abs);
    if (change.changeType === "created") {
      fs.renameSync(stashed, abs);
    } else {
      fs.copyFileSync(stashed, abs);
    }
  }
}

export function setModEnabled(options: {
  repo: ModRepository;
  paths: ModManagerPaths;
  modId: string;
  enabled: boolean;
}): ModActionResult {
  const mod = options.repo.getMod(options.modId);
  if (mod === null) {
    return { success: false, error: "Mod not found" };
  }
  if (mod.enabled === options.enabled) {
    return { success: true, modId: mod.id };
  }

  try {
    if (mod.kind === "workshop") {
      if (mod.packageName === null || mod.packageName === "") {
        return { success: false, error: "Workshop mod missing PackageName" };
      }
      const before = readSettingsText(mod.installPath);
      const next = options.enabled
        ? addActiveMod(before, mod.packageName)
        : removeActiveMod(before, mod.packageName);
      writeSettingsText(mod.installPath, next);
    } else if (options.enabled) {
      restorePathDeployFromStash(options.repo, options.paths, mod);
    } else {
      softRemovePathDeploy(options.repo, options.paths, mod);
    }
    options.repo.setEnabled(mod.id, options.enabled);
    return { success: true, modId: mod.id };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function removeMod(options: {
  repo: ModRepository;
  paths: ModManagerPaths;
  modId: string;
}): ModActionResult {
  const mod = options.repo.getMod(options.modId);
  if (mod === null) {
    return { success: false, error: "Mod not found" };
  }

  try {
    if (mod.enabled) {
      const disabled = setModEnabled({
        repo: options.repo,
        paths: options.paths,
        modId: mod.id,
        enabled: false,
      });
      if (!disabled.success) {
        return disabled;
      }
    }

    const changes = options.repo.listFileChanges(mod.id);

    if (mod.kind === "workshop") {
      const settingsChanges = changes.filter(
        (c) => c.relativePath === SETTINGS_REL
      );
      for (const change of settingsChanges) {
        if (change.changeType === "overwritten") {
          const backup = options.repo.getBackup(change.id);
          if (backup) {
            writeSettingsText(mod.installPath, backup.toString("utf8"));
          }
        } else if (change.changeType === "settings") {
          const text = readSettingsText(mod.installPath);
          if (!text.includes("ActiveModList=")) {
            const p = settingsAbs(mod.installPath);
            if (fs.existsSync(p)) {
              fs.unlinkSync(p);
            }
          }
        }
      }

      for (const change of changes) {
        if (change.relativePath === SETTINGS_REL) {
          continue;
        }
        if (change.changeType === "created") {
          const abs = absUnderInstall(mod.installPath, change.relativePath);
          if (fs.existsSync(abs)) {
            fs.unlinkSync(abs);
          }
        }
      }
      if (mod.workshopFolder !== null && mod.workshopFolder !== "") {
        const folderAbs = absUnderInstall(mod.installPath, mod.workshopFolder);
        fs.rmSync(folderAbs, { recursive: true, force: true });
      }
    } else {
      for (const change of changes) {
        if (change.changeType === "created") {
          const abs = absUnderInstall(mod.installPath, change.relativePath);
          if (fs.existsSync(abs)) {
            fs.unlinkSync(abs);
          }
        }
      }
    }

    fs.rmSync(stashDir(options.paths, mod.id), {
      recursive: true,
      force: true,
    });
    options.repo.deleteMod(mod.id);
    return { success: true, modId: mod.id };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
