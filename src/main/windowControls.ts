import { ipcMain, BrowserWindow } from "electron";

export function registerWindowControlHandlers(
  getMainWindow: () => BrowserWindow | null
): void {
  ipcMain.handle("window-minimize", () => {
    const mainWindow = getMainWindow();
    if (mainWindow === null) {
      return { success: false, error: "Main window not available" };
    }
    try {
      mainWindow.minimize();
      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  });

  ipcMain.handle("window-maximize-toggle", () => {
    const mainWindow = getMainWindow();
    if (mainWindow === null) {
      return { success: false, error: "Main window not available" };
    }
    try {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.maximize();
      }
      return { success: true, maximized: mainWindow.isMaximized() };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  });

  ipcMain.handle("window-close", () => {
    const mainWindow = getMainWindow();
    if (mainWindow === null) {
      return { success: false, error: "Main window not available" };
    }
    try {
      mainWindow.close();
      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  });
}
