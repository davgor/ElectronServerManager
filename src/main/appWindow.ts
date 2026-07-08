import path from "path";

import { app, BrowserWindow, screen } from "electron";

let mainWindow: BrowserWindow | null = null;

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

export function createWindow(isDev: boolean): void {
  mainWindow = new BrowserWindow({
    width: 1220,
    height: 900,
    useContentSize: true,
    minWidth: 1000,
    minHeight: 700,
    frame: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.setMenuBarVisibility(false);

  const startURL = isDev
    ? "http://localhost:5173"
    : `file://${path.join(__dirname, "../../dist/renderer/index.html")}`;

  void mainWindow.loadURL(startURL);

  mainWindow.webContents.once("did-finish-load", () => {
    void (async () => {
      try {
        const dims = (await mainWindow!.webContents.executeJavaScript(
          "({w: Math.max(document.documentElement.clientWidth, document.body.scrollWidth || 0), h: Math.max(document.documentElement.clientHeight, document.body.scrollHeight || 0)})"
        )) as { w: number; h: number } | null;

        if (dims && typeof dims.w === "number" && typeof dims.h === "number") {
          const paddingX = 16;
          const paddingY = 120;

          const desiredWidth = Math.max(900, Math.round(dims.w + paddingX));
          const desiredHeight = Math.max(600, Math.round(dims.h + paddingY));

          const workArea = screen.getPrimaryDisplay().workAreaSize;
          const maxWidth = Math.max(600, workArea.width - 40);
          const maxHeight = Math.max(400, workArea.height - 40);

          const finalWidth = Math.min(desiredWidth, maxWidth);
          const finalHeight = Math.min(desiredHeight, maxHeight);

          mainWindow!.setContentSize(finalWidth, finalHeight);
        }
      } catch {
        // ignore measurement errors — fall back to default size
      }
    })();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

export function registerAppLifecycle(isDev: boolean): void {
  app.on("ready", () => {
    createWindow(isDev);
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });

  app.on("activate", () => {
    if (mainWindow === null) {
      createWindow(isDev);
    }
  });
}
