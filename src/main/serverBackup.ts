import type {
  BackupServerSaveResponse,
  SelectBackupFolderResponse,
} from "../types/ipc";

import * as logger from "./logger";
import { backupServerSave as steamBackupServerSave } from "./steamDetection";

type BackupResult = BackupServerSaveResponse;

type BackupFolderResult = SelectBackupFolderResponse;

interface BackupFolderDialog {
  showOpenDialog(
    parent: unknown,
    options: { properties: string[]; title: string }
  ): Promise<{ canceled: boolean; filePaths: string[] }>;
}

export async function backupServerSaveHandler(
  appId: number,
  installPath: string,
  backupPath: string
): Promise<BackupResult> {
  try {
    logger.info(`Backing up server ${appId} to ${backupPath}`);

    const backupFile = await steamBackupServerSave(
      appId,
      installPath,
      backupPath
    );

    if (backupFile === null) {
      return {
        success: false,
        error: "Failed to create backup",
      };
    }

    logger.info(`Backup completed: ${backupFile}`);

    return { success: true, backupPath: backupFile };
  } catch (error) {
    logger.error("Error creating backup:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Backup failed",
    };
  }
}

export async function selectBackupFolder(
  getMainWindow: () => unknown,
  dialogApi: BackupFolderDialog
): Promise<BackupFolderResult> {
  try {
    const mainWindow = getMainWindow();
    if (mainWindow === null || mainWindow === undefined) {
      return {
        success: false,
        path: null,
        error: "Main window not available",
      };
    }

    const result = await dialogApi.showOpenDialog(mainWindow, {
      properties: ["openDirectory"],
      title: "Select Backup Location",
    });

    if (result.canceled) {
      return { success: false, path: null };
    }

    const selectedPath = result.filePaths[0];
    logger.info(`Backup folder selected: ${selectedPath}`);

    return { success: true, path: selectedPath };
  } catch (error) {
    logger.error("Error selecting backup folder:", error);
    return {
      success: false,
      path: null,
      error: error instanceof Error ? error.message : "Failed to select folder",
    };
  }
}
