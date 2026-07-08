import path from "path";
import { execSync } from "child_process";

import {
  app,
  BrowserWindow,
  Menu,
  ipcMain,
  dialog,
  shell,
  screen,
} from "electron";

import {
  findInstalledServers,
  backupServerSave,
  STEAM_DEDICATED_SERVERS,
  ServerInfo,
} from "./steamDetection";
import { getCommonSteamPaths } from "./driveUtils";
import { parseIniContent, stringifyIniContent } from "./iniConfig";
import { startServer, stopServer, autoUpdateServer } from "./serverProcess";

const isDev = Boolean(
  process.env.NODE_ENV === "development" || process.env.ELECTRON_START_URL
);

let mainWindow: BrowserWindow | null;

function createWindow(): void {
  // Open at a size that should fit the main UI without vertical scrolling
  // `useContentSize: true` makes the width/height refer to the web page size (content),
  // which helps avoid accidental scrollbars when using a frameless window.
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

  // Remove native title bar (frameless window) for a cleaner, custom chrome
  // and hide the menu bar by default. Renderer should provide window controls.
  mainWindow.setMenuBarVisibility(false);

  const startURL = isDev
    ? "http://localhost:5173"
    : `file://${path.join(__dirname, "../../dist/renderer/index.html")}`;

  void mainWindow.loadURL(startURL);

  // After the renderer finishes loading, measure the page and resize the window
  // so the content fits without scrollbars (but respect screen work area limits).
  mainWindow.webContents.once("did-finish-load", () => {
    void (async () => {
      try {
        const dims = (await mainWindow!.webContents.executeJavaScript(
          // return content width/height
          "({w: Math.max(document.documentElement.clientWidth, document.body.scrollWidth || 0), h: Math.max(document.documentElement.clientHeight, document.body.scrollHeight || 0)})"
        )) as { w: number; h: number } | null;

        if (dims && typeof dims.w === "number" && typeof dims.h === "number") {
          const paddingX = 16; // slightly thinner horizontal padding
          const paddingY = 120; // larger vertical padding so window is taller

          const desiredWidth = Math.max(900, Math.round(dims.w + paddingX));
          const desiredHeight = Math.max(600, Math.round(dims.h + paddingY));

          const workArea = screen.getPrimaryDisplay().workAreaSize;
          const maxWidth = Math.max(600, workArea.width - 40);
          const maxHeight = Math.max(400, workArea.height - 40);

          const finalWidth = Math.min(desiredWidth, maxWidth);
          const finalHeight = Math.min(desiredHeight, maxHeight);

          // Use setContentSize so we set the web (content) size when frameless
          mainWindow!.setContentSize(finalWidth, finalHeight);
        }
      } catch (err) {
        // ignore measurement errors — fall back to default size
      }
    })();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.on("ready", createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// Window control IPC handlers (for frameless window controls in renderer)
ipcMain.handle("window-minimize", () => {
  if (!mainWindow) {
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
  if (!mainWindow) {
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
  if (!mainWindow) {
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

// IPC Handlers
ipcMain.handle("get-app-version", () => {
  return app.getVersion();
});

ipcMain.handle("check-diagnostics", () => {
  const diagnostics: Record<string, boolean | string | string[]> = {};

  // Check if we can execute processes
  try {
    execSync("echo test", { encoding: "utf8" });
    diagnostics.canExecuteProcesses = true;
  } catch {
    diagnostics.canExecuteProcesses = false;
  }

  // Check platform
  diagnostics.platform = process.platform;

  // Check if Steam is installed
  try {
    const steamPaths = getCommonSteamPaths();
    diagnostics.steamFound = steamPaths.length > 0;
    diagnostics.steamPaths = steamPaths;
  } catch (err) {
    diagnostics.steamFound = false;
    diagnostics.steamError =
      err instanceof Error ? err.message : "Unknown error";
  }

  return diagnostics;
});

ipcMain.handle("get-steam-paths", () => {
  try {
    const paths = getCommonSteamPaths();
    return paths;
  } catch (error) {
    console.error("Error getting Steam paths:", error);
    return [];
  }
});

ipcMain.handle("get-steam-servers", async (_event, path?: string) => {
  try {
    const servers = await findInstalledServers(path);
    return { success: true, servers };
  } catch (error) {
    console.error("Error finding Steam servers:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
      servers: [],
    };
  }
});

ipcMain.handle("run-server", (_event, appId: number, installPath: string) => {
  return startServer(appId, installPath);
});

ipcMain.handle("stop-server", (_event, appId: number, installPath: string) => {
  return stopServer(appId, installPath);
});

ipcMain.handle(
  "auto-update-server",
  async (_event, appId: number, installPath: string, steamPath: string) => {
    return autoUpdateServer(appId, installPath, steamPath);
  }
);

ipcMain.handle(
  "backup-server-save",
  async (_event, appId: number, installPath: string, backupPath: string) => {
    try {
      // eslint-disable-next-line no-console
      console.log(`Backing up server ${appId} to ${backupPath}`);

      const backupFile = await backupServerSave(appId, installPath, backupPath);

      if (backupFile === null) {
        return {
          success: false,
          error: "Failed to create backup",
        };
      }

      // eslint-disable-next-line no-console
      console.log(`Backup completed: ${backupFile}`);

      return { success: true, backupPath: backupFile };
    } catch (error) {
      console.error("Error creating backup:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Backup failed",
      };
    }
  }
);

ipcMain.handle("set-backup-location", async (_event, backupPath: string) => {
  try {
    // Validate that the path is accessible
    const fs = await import("fs/promises");
    try {
      await fs.mkdir(backupPath, { recursive: true });
      // eslint-disable-next-line no-console
      console.log(`Backup location set to: ${backupPath}`);
      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: `Cannot create backup directory: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  } catch (error) {
    console.error("Error setting backup location:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to set backup location",
    };
  }
});

ipcMain.handle("select-backup-folder", async () => {
  try {
    if (!mainWindow) {
      return {
        success: false,
        path: null,
        error: "Main window not available",
      };
    }

    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openDirectory"],
      title: "Select Backup Location",
    });

    if (result.canceled) {
      return { success: false, path: null };
    }

    const selectedPath = result.filePaths[0];
    // eslint-disable-next-line no-console
    console.log(`Backup folder selected: ${selectedPath}`);

    return { success: true, path: selectedPath };
  } catch (error) {
    console.error("Error selecting backup folder:", error);
    return {
      success: false,
      path: null,
      error: error instanceof Error ? error.message : "Failed to select folder",
    };
  }
});

// Config file handlers using mapping from steamDetection
ipcMain.handle(
  "get-server-config",
  async (_event, appId: number, installPath: string) => {
    try {
      const fs = await import("fs/promises");

      // Ensure mapping exists for this appId
      if (
        !Object.prototype.hasOwnProperty.call(
          STEAM_DEDICATED_SERVERS,
          String(appId)
        )
      ) {
        return { success: false, error: `No config mapping for app ${appId}` };
      }

      const serverInfo = STEAM_DEDICATED_SERVERS[
        appId as unknown as keyof typeof STEAM_DEDICATED_SERVERS
      ] as unknown as ServerInfo;
      if (
        serverInfo.configLocation === undefined ||
        serverInfo.configLocation === ""
      ) {
        return { success: false, error: `No config mapping for app ${appId}` };
      }

      const configPath = path.join(installPath, serverInfo.configLocation);

      try {
        await fs.stat(configPath);
      } catch {
        return {
          success: false,
          error: `Config file not found: ${configPath}`,
        };
      }

      const content = await fs.readFile(configPath, "utf-8");

      // Detect format based on extension (json or ini)
      const format = configPath.toLowerCase().endsWith(".json")
        ? "json"
        : "ini";

      let parsed: Record<string, unknown> = {};
      if (format === "json") {
        parsed = JSON.parse(content) as Record<string, unknown>;
      } else {
        parsed = parseIniContent(content);
      }

      return { success: true, content: parsed, format, filePath: configPath };
    } catch (err) {
      console.error("Error reading server config:", err);
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
);

// Open a file in the default OS application
ipcMain.handle("open-file-default", async (_event, filePath: string) => {
  try {
    if (!filePath || typeof filePath !== "string") {
      return { success: false, error: "Invalid file path" };
    }

    // Use Electron shell to open the path with the default app
    const result = await shell.openPath(filePath);
    // shell.openPath returns an empty string on success, otherwise an error message
    if (typeof result === "string" && result.length > 0) {
      return { success: false, error: result };
    }
    return { success: true };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Error opening file:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
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
    try {
      const fs = await import("fs/promises");

      if (
        !Object.prototype.hasOwnProperty.call(
          STEAM_DEDICATED_SERVERS,
          String(appId)
        )
      ) {
        return { success: false, error: `No config mapping for app ${appId}` };
      }

      const serverInfo = STEAM_DEDICATED_SERVERS[
        appId as unknown as keyof typeof STEAM_DEDICATED_SERVERS
      ] as unknown as ServerInfo;
      if (
        serverInfo.configLocation === undefined ||
        serverInfo.configLocation === ""
      ) {
        return { success: false, error: `No config mapping for app ${appId}` };
      }

      const configPath = path.join(installPath, serverInfo.configLocation);

      let fileContent = "";
      if (format === "json") {
        fileContent = JSON.stringify(content, null, 2);
      } else {
        fileContent = stringifyIniContent(content);
      }

      await fs.writeFile(configPath, fileContent, "utf-8");
      return { success: true };
    } catch (err) {
      console.error("Error saving server config:", err);
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
);

// Remove the application menu so the app has no native top menu bar
Menu.setApplicationMenu(null);
