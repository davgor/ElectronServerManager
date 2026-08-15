import path from "path";

import type { BrowserWindow } from "electron";

import type {
  IpcActionResult,
  ListServerModsResponse,
  SelectAndImportModZipResponse,
  ServerModSummary,
} from "../../types/ipc";
import { PALWORLD_APP_ID } from "../../types/ipc";

import {
  getModManagerPaths,
  getModRepository,
} from "./initModManager";
import {
  importModZip,
  removeMod,
  setModEnabled,
} from "./modLifecycle";

interface FileDialog {
  showOpenDialog(
    parent: unknown,
    options: {
      properties: string[];
      title: string;
      filters?: Array<{ name: string; extensions: string[] }>;
    }
  ): Promise<{ canceled: boolean; filePaths: string[] }>;
}

function toSummary(mod: {
  id: string;
  displayName: string;
  packageName: string | null;
  sourceZipName: string | null;
  kind: "workshop" | "path_deploy";
  enabled: boolean;
  importedAt: string;
}): ServerModSummary {
  return {
    id: mod.id,
    displayName: mod.displayName,
    packageName: mod.packageName,
    sourceZipName: mod.sourceZipName,
    kind: mod.kind,
    enabled: mod.enabled,
    importedAt: mod.importedAt,
  };
}

export function listServerMods(
  appId: number,
  installPath: string
): ListServerModsResponse {
  if (appId !== PALWORLD_APP_ID) {
    return {
      success: false,
      error: "Mod manager is only available for Palworld dedicated servers",
      mods: [],
    };
  }
  try {
    const mods = getModRepository()
      .listMods(appId, installPath)
      .map(toSummary);
    return { success: true, mods };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      mods: [],
    };
  }
}

export async function selectAndImportModZip(
  appId: number,
  installPath: string,
  getMainWindow: () => BrowserWindow | null,
  dialogApi: FileDialog,
  readFile: (filePath: string) => Promise<Buffer> | Buffer
): Promise<SelectAndImportModZipResponse> {
  if (appId !== PALWORLD_APP_ID) {
    return {
      success: false,
      error: "Mod manager is only available for Palworld dedicated servers",
    };
  }

  const parent = getMainWindow();
  if (parent === null) {
    return { success: false, error: "Main window not available" };
  }

  const result = await dialogApi.showOpenDialog(parent, {
    properties: ["openFile"],
    title: "Select mod zip file",
    filters: [{ name: "Zip archives", extensions: ["zip"] }],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { success: false, error: "canceled", canceled: true };
  }

  const zipPath = result.filePaths[0];
  if (!zipPath) {
    return { success: false, error: "canceled", canceled: true };
  }

  try {
    const zipBytes = await readFile(zipPath);
    const imported = importModZip({
      repo: getModRepository(),
      appId,
      installPath,
      zipBytes: new Uint8Array(zipBytes),
      sourceZipName: path.basename(zipPath),
    });
    if (!imported.success) {
      return { success: false, error: imported.error };
    }
    const mod = getModRepository().getMod(imported.modId as string);
    return {
      success: true,
      mod: mod ? toSummary(mod) : undefined,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function setServerModEnabled(
  modId: string,
  enabled: boolean
): IpcActionResult {
  try {
    return setModEnabled({
      repo: getModRepository(),
      paths: getModManagerPaths(),
      modId,
      enabled,
    });
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function removeServerMod(modId: string): IpcActionResult {
  try {
    return removeMod({
      repo: getModRepository(),
      paths: getModManagerPaths(),
      modId,
    });
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
