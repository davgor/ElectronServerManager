import { app, ipcMain, dialog, BrowserWindow } from "electron";

import { registerWindowControlHandlers } from "./windowControls";
import {
  collectDiagnostics,
  listSteamPaths,
  fetchSteamServers,
  openFileDefault,
} from "./steamIpc";
import { startServer, stopServer, autoUpdateServer } from "./serverProcess";
import { getServerConfig, saveServerConfig } from "./serverConfig";
import { backupServerSaveHandler, selectBackupFolder } from "./serverBackup";

export interface IpcRegistrationDeps {
  getMainWindow: () => BrowserWindow | null;
  dialogApi: Pick<typeof dialog, "showOpenDialog">;
}

export function registerIpcHandlers(deps: IpcRegistrationDeps): void {
  const { getMainWindow, dialogApi } = deps;

  registerWindowControlHandlers(getMainWindow);

  ipcMain.handle("get-app-version", () => app.getVersion());

  ipcMain.handle("check-diagnostics", () => collectDiagnostics());

  ipcMain.handle("get-steam-paths", () => listSteamPaths());

  ipcMain.handle("get-steam-servers", async (_event, path?: string) => {
    return fetchSteamServers(path);
  });

  ipcMain.handle("run-server", (_event, appId: number, installPath: string) => {
    return startServer(appId, installPath);
  });

  ipcMain.handle(
    "stop-server",
    (_event, appId: number, installPath: string) => {
      return stopServer(appId, installPath);
    }
  );

  ipcMain.handle(
    "auto-update-server",
    async (_event, appId: number, installPath: string, steamPath: string) => {
      return autoUpdateServer(appId, installPath, steamPath);
    }
  );

  ipcMain.handle(
    "backup-server-save",
    async (_event, appId: number, installPath: string, backupPath: string) => {
      return backupServerSaveHandler(appId, installPath, backupPath);
    }
  );

  ipcMain.handle("select-backup-folder", async () => {
    return selectBackupFolder(getMainWindow, dialogApi);
  });

  ipcMain.handle(
    "get-server-config",
    async (_event, appId: number, installPath: string) => {
      return getServerConfig(appId, installPath);
    }
  );

  ipcMain.handle("open-file-default", async (_event, filePath: string) => {
    return openFileDefault(filePath);
  });

  ipcMain.handle(
    "save-server-config",
    async (
      _event,
      appId: number,
      installPath: string,
      content: Record<string, unknown>,
      format: "json" | "ini"
    ) => {
      return saveServerConfig(appId, installPath, content, format);
    }
  );
}
