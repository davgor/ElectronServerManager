import path from "path";
import { spawn, execSync } from "child_process";

import { app, BrowserWindow, Menu, ipcMain, dialog } from "electron";

import {
  findInstalledServers,
  getServerBuildId,
  backupServerSave,
} from "./steamDetection";
import { getCommonSteamPaths } from "./driveUtils";

// Server executable mapping
const SERVER_EXECUTABLES: Record<number, string> = {
  2278520: "enshrouded_server.exe", // Enshrouded
  892970: "valheim_server.exe", // Valheim
  1623730: "pal_server.exe", // Palworld
};

// For CommonJS compatibility - declare global __dirname
declare global {
  // eslint-disable-next-line no-var
  var __dirname: string;
}

const isDev = Boolean(
  process.env.NODE_ENV === "development" || process.env.ELECTRON_START_URL
);

let mainWindow: BrowserWindow | null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 400,
    minHeight: 300,
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  const startURL = isDev
    ? "http://localhost:5173"
    : `file://${path.join(__dirname, "../../dist/renderer/index.html")}`;

  void mainWindow.loadURL(startURL);

  if (isDev === true) {
    mainWindow.webContents.openDevTools();
  }

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

// IPC Handlers
ipcMain.handle("get-app-version", () => {
  return app.getVersion();
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
  try {
    // eslint-disable-next-line no-console
    console.log(`Starting server ${appId} at: ${installPath}`);

    const executable = SERVER_EXECUTABLES[appId];
    if (!executable) {
      return {
        success: false,
        error: `Unknown server app ID: ${appId}`,
      };
    }

    const serverExePath = path.join(installPath, executable);

    // Launch the server executable detached from this process
    const serverProcess = spawn(serverExePath, [], {
      cwd: installPath,
      detached: true,
      stdio: "ignore",
      shell: true,
    });

    // Handle errors from the spawned process
    serverProcess.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "ENOENT") {
        // eslint-disable-next-line no-console
        console.error(`Server executable not found: ${serverExePath}`);
      } else {
        // eslint-disable-next-line no-console
        console.error(`Failed to start server: ${err.message}`);
      }
    });

    // Unref the process so it doesn't keep the parent alive
    serverProcess.unref();

    // eslint-disable-next-line no-console
    console.log(`Server process launched: ${executable}`);

    return { success: true };
  } catch (error) {
    console.error("Error starting server:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to start server",
    };
  }
});

ipcMain.handle("stop-server", (_event, appId: number, installPath: string) => {
  try {
    // eslint-disable-next-line no-console
    console.log(`Stopping server ${appId} at: ${installPath}`);

    const executable = SERVER_EXECUTABLES[appId];
    if (!executable) {
      return {
        success: false,
        error: `Unknown server app ID: ${appId}`,
      };
    }

    const platform = process.platform;
    const exeName = path.basename(executable, path.extname(executable));
    let killCommand: string;

    // Determine kill command based on platform
    if (platform === "win32") {
      killCommand = `taskkill /F /IM ${exeName}.exe 2>nul || exit /b 0`;
    } else {
      killCommand = `pkill -f "${exeName}" || true`;
    }

    // Execute the kill command
    try {
      execSync(killCommand);
    } catch (err) {
      // Command might fail if process not found, which is ok
    }

    // eslint-disable-next-line no-console
    console.log(`Stop command sent for server ${appId}`);

    return { success: true };
  } catch (error) {
    console.error("Error stopping server:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to stop server",
    };
  }
});

ipcMain.handle(
  "auto-update-server",
  async (_event, appId: number, installPath: string, steamPath: string) => {
    try {
      // eslint-disable-next-line no-console
      console.log(`Starting auto-update for server ${appId}`);

      const executable = SERVER_EXECUTABLES[appId];
      if (!executable) {
        return {
          success: false,
          error: `Unknown server app ID: ${appId}`,
        };
      }

      // Get current buildid before potential update
      const currentBuildId = await getServerBuildId(appId, steamPath);
      // eslint-disable-next-line no-console
      console.log(`Current buildid for app ${appId}: ${currentBuildId}`);

      // Step 1: Stop the server if it's running
      const platform = process.platform;
      const exeName = path.basename(executable, path.extname(executable));
      let killCommand: string;

      if (platform === "win32") {
        killCommand = `taskkill /F /IM ${exeName}.exe 2>nul || exit /b 0`;
      } else {
        killCommand = `pkill -f "${exeName}" || true`;
      }

      try {
        execSync(killCommand);
        // eslint-disable-next-line no-console
        console.log(`Stopped server ${appId} for update`);
      } catch (err) {
        // Process might already be stopped
      }

      // Step 2: Wait for Steam to update (Steam background process handles this)
      // In practice, Steam will automatically download and install updates
      // eslint-disable-next-line no-console
      console.log(`Waiting for Steam update to complete...`);

      // Wait 10 seconds to allow Steam to detect and download update
      await new Promise((resolve) => setTimeout(resolve, 10000));

      // Check if buildid has changed (indicating an update was applied)
      const newBuildId = await getServerBuildId(appId, steamPath);
      // eslint-disable-next-line no-console
      console.log(`Buildid after update check for app ${appId}: ${newBuildId}`);

      if (newBuildId === null || newBuildId === currentBuildId) {
        // No update was available or update hasn't been applied yet
        // eslint-disable-next-line no-console
        console.log(`No update available for server ${appId}`);
        return { success: false, error: "No update available" };
      }

      // Step 3: Buildid changed, so update was applied. Restart the server
      // eslint-disable-next-line no-console
      console.log(`Update detected for server ${appId}, restarting...`);

      const serverExePath = path.join(installPath, executable);

      const serverProcess = spawn(serverExePath, [], {
        cwd: installPath,
        detached: true,
        stdio: "ignore",
        shell: true,
      });

      serverProcess.on("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "ENOENT") {
          // eslint-disable-next-line no-console
          console.error(
            `Server executable not found after update: ${serverExePath}`
          );
        } else {
          // eslint-disable-next-line no-console
          console.error(
            `Failed to restart server after update: ${err.message}`
          );
        }
      });

      serverProcess.unref();

      // eslint-disable-next-line no-console
      console.log(`Server ${appId} restarted after update`);

      return { success: true };
    } catch (error) {
      console.error("Error during auto-update:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Auto-update failed",
      };
    }
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

const menu = Menu.buildFromTemplate([
  {
    label: "File",
    submenu: [
      {
        label: "Exit",
        accelerator: "CmdOrCtrl+Q",
        click: () => {
          app.quit();
        },
      },
    ],
  },
  {
    label: "Edit",
    submenu: [
      { label: "Undo", accelerator: "CmdOrCtrl+Z", role: "undo" },
      { label: "Redo", accelerator: "Shift+CmdOrCtrl+Z", role: "redo" },
      { type: "separator" },
      { label: "Cut", accelerator: "CmdOrCtrl+X", role: "cut" },
      { label: "Copy", accelerator: "CmdOrCtrl+C", role: "copy" },
      { label: "Paste", accelerator: "CmdOrCtrl+V", role: "paste" },
    ],
  },
]);

Menu.setApplicationMenu(menu);
