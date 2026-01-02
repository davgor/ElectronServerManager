import path from "path";
import { existsSync } from "fs";
import { spawn, execSync } from "child_process";

import { app, BrowserWindow, Menu, ipcMain, dialog, shell, screen } from "electron";

import {
  findInstalledServers,
  getServerBuildId,
  backupServerSave,
  STEAM_DEDICATED_SERVERS,
  ServerInfo,
} from "./steamDetection";
import { getCommonSteamPaths } from "./driveUtils";

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
          '({w: Math.max(document.documentElement.clientWidth, document.body.scrollWidth || 0), h: Math.max(document.documentElement.clientHeight, document.body.scrollHeight || 0)})'
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
    return { success: false, error: err instanceof Error ? err.message : String(err) };
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
    return { success: false, error: err instanceof Error ? err.message : String(err) };
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
    return { success: false, error: err instanceof Error ? err.message : String(err) };
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
    diagnostics.steamError = err instanceof Error ? err.message : "Unknown error";
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
  try {
    // eslint-disable-next-line no-console
    console.log(`Starting server ${appId} at: ${installPath}`);

    // Lookup executable from STEAM_DEDICATED_SERVERS
    const mappingEntry = (STEAM_DEDICATED_SERVERS as Record<string, ServerInfo | undefined>)[String(appId)];
    if (!mappingEntry || typeof mappingEntry.executable !== "string" || mappingEntry.executable.length === 0) {
      return {
        success: false,
        error: `Unknown server app ID or executable not defined: ${appId}`,
      };
    }

    const serverExePath = path.join(installPath, mappingEntry.executable);
    
    // Verify the executable exists before attempting to launch
    if (!existsSync(serverExePath)) {
      // eslint-disable-next-line no-console
      console.error(`Server executable not found: ${serverExePath}`);
      return {
        success: false,
        error: `Server executable not found at: ${serverExePath}. Please verify the installation path.`,
      };
    }
    
    // Verify the install directory exists
    if (!existsSync(installPath)) {
      // eslint-disable-next-line no-console
      console.error(`Install directory not found: ${installPath}`);
      return {
        success: false,
        error: `Install directory not found: ${installPath}`,
      };
    }

    // Launch the server executable detached from this process
    // Quote the path in case it contains spaces
    const quotedPath = `"${serverExePath}"`;
    
    // eslint-disable-next-line no-console
    console.log(`Attempting to spawn: ${quotedPath} from ${installPath}`);

    const serverProcess = spawn(quotedPath, [], {
      cwd: installPath,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
      shell: true,
    });

    let errorOutput = "";

    // Attach listeners BEFORE unreffing
    // Handle errors from the spawned process
    serverProcess.on("error", (err: NodeJS.ErrnoException) => {
      // eslint-disable-next-line no-console
      console.error(`Spawn error for ${mappingEntry.executable}: ${err.message} (code: ${err.code})`);
    });

    // Capture stderr to log startup errors
    serverProcess.stderr.on("data", (data: Buffer) => {
      errorOutput += data.toString();
      // eslint-disable-next-line no-console
      console.error(`Server stderr: ${data.toString()}`);
    });
    
    // Capture stdout for debugging
    serverProcess.stdout.on("data", (data: Buffer) => {
      // eslint-disable-next-line no-console
      console.log(`Server stdout: ${data.toString()}`);
    });

    // Exit handler for debugging
    serverProcess.on("exit", (code, signal) => {
      // eslint-disable-next-line no-console
      console.log(`Server process exited with code ${code}, signal ${signal}`);
      if (code !== 0 && errorOutput) {
        // eslint-disable-next-line no-console
        console.error(`Server error output: ${errorOutput}`);
      }
    });

    // Unref the process so it doesn't keep the parent alive
    serverProcess.unref();

    // eslint-disable-next-line no-console
    console.log(`Server spawn called for: ${mappingEntry.executable}`);

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

    const mappingEntry = (STEAM_DEDICATED_SERVERS as Record<string, ServerInfo | undefined>)[String(appId)];
    if (!mappingEntry || typeof mappingEntry.executable !== "string" || mappingEntry.executable.length === 0) {
      return {
        success: false,
        error: `Unknown server app ID or executable not defined: ${appId}`,
      };
    }

    const platform = process.platform;
    const exeName = path.basename(mappingEntry.executable, path.extname(mappingEntry.executable));
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

      const mappingEntry = (STEAM_DEDICATED_SERVERS as Record<string, ServerInfo | undefined>)[String(appId)];
      if (!mappingEntry || typeof mappingEntry.executable !== "string" || mappingEntry.executable.length === 0) {
        return {
          success: false,
          error: `Unknown server app ID or executable not defined: ${appId}`,
        };
      }

      // Get current buildid before potential update
      const currentBuildId = await getServerBuildId(appId, steamPath);
      // eslint-disable-next-line no-console
      console.log(`Current buildid for app ${appId}: ${currentBuildId}`);

      // Step 1: Stop the server if it's running
      const platform = process.platform;
      const exeName = path.basename(mappingEntry.executable, path.extname(mappingEntry.executable));
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

      const serverExePath = path.join(installPath, mappingEntry.executable);

      // eslint-disable-next-line no-console
      console.log(`Attempting to spawn updated server: "${serverExePath}" from ${installPath}`);

      const quotedPath = `"${serverExePath}"`;
      const serverProcess = spawn(quotedPath, [], {
        cwd: installPath,
        detached: true,
        stdio: ["ignore", "pipe", "pipe"],
        shell: true,
      });

      serverProcess.on("error", (err: NodeJS.ErrnoException) => {
        // eslint-disable-next-line no-console
        console.error(`Spawn error after update for ${mappingEntry.executable}: ${err.message} (code: ${err.code})`);
      });

      serverProcess.stderr.on("data", (data: Buffer) => {
        // eslint-disable-next-line no-console
        console.error(`Server stderr after update: ${data.toString()}`);
      });

      serverProcess.on("exit", (code, signal) => {
        // eslint-disable-next-line no-console
        console.log(`Updated server process exited with code ${code}, signal ${signal}`);
      });

      serverProcess.unref();

      // eslint-disable-next-line no-console
      console.log(`Updated server spawn called for: ${mappingEntry.executable}`);

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

// Config file handlers using mapping from steamDetection
ipcMain.handle(
  "get-server-config",
  async (_event, appId: number, installPath: string) => {
    try {
      const fs = await import("fs/promises");

      // Ensure mapping exists for this appId
      if (!Object.prototype.hasOwnProperty.call(STEAM_DEDICATED_SERVERS, String(appId))) {
        return { success: false, error: `No config mapping for app ${appId}` };
      }

      const serverInfo = STEAM_DEDICATED_SERVERS[appId as unknown as keyof typeof STEAM_DEDICATED_SERVERS] as unknown as ServerInfo;
      if (serverInfo.configLocation === undefined || serverInfo.configLocation === "") {
        return { success: false, error: `No config mapping for app ${appId}` };
      }

      const configPath = path.join(installPath, serverInfo.configLocation);

      try {
        await fs.stat(configPath);
      } catch {
        return { success: false, error: `Config file not found: ${configPath}` };
      }

      const content = await fs.readFile(configPath, "utf-8");

      // Detect format based on extension (json or ini)
      const format = configPath.toLowerCase().endsWith(".json") ? "json" : "ini";

      let parsed: Record<string, unknown> = {};
      if (format === "json") {
        parsed = JSON.parse(content) as Record<string, unknown>;
      } else {
        parsed = parseIniContent(content);
      }

      return { success: true, content: parsed, format, filePath: configPath };
    } catch (err) {
      console.error("Error reading server config:", err);
      return { success: false, error: err instanceof Error ? err.message : String(err) };
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
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
});

ipcMain.handle(
  "save-server-config",
  async (_event, appId: number, installPath: string, content: Record<string, unknown>, format: "json" | "ini") => {
    try {
      const fs = await import("fs/promises");


      if (!Object.prototype.hasOwnProperty.call(STEAM_DEDICATED_SERVERS, String(appId))) {
        return { success: false, error: `No config mapping for app ${appId}` };
      }

      const serverInfo = STEAM_DEDICATED_SERVERS[appId as unknown as keyof typeof STEAM_DEDICATED_SERVERS] as unknown as ServerInfo;
      if (serverInfo.configLocation === undefined || serverInfo.configLocation === "") {
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
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
);

// INI helpers
function parseIniContent(content: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  let currentSection = "";

  function splitRespectingQuotes(s: string, delim = ",") {
    const parts: string[] = [];
    let cur = "";
    let inQuote = false;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (ch === '"') {
        inQuote = !inQuote;
        cur += ch;
        continue;
      }
      if (ch === delim && !inQuote) {
        parts.push(cur.trim());
        cur = "";
      } else {
        cur += ch;
      }
    }
    if (cur.trim() !== "") {
      parts.push(cur.trim());
    }
    return parts;
  }

  function parseTokenValue(token: string): unknown {
    const t = token.trim();
    if (t === "") {
      return "";
    }
    if (t.startsWith('"') && t.endsWith('"')) {
      return t.slice(1, -1);
    }
    if (/^[-+]?\d+\.?\d*$/.test(t)) {
      return Number(t);
    }
    if (/^(true|false)$/i.test(t)) {
      return t.toLowerCase() === "true";
    }
    return t;
  }

  const lines = content.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith(";") || line.startsWith("#")) {
      continue;
    }

    if (line.startsWith("[") && line.endsWith("]")) {
      currentSection = line.slice(1, -1);
      result[currentSection] = {};
      continue;
    }

    const idx = line.indexOf("=");
    if (idx === -1) {
      continue;
    }
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();

    // Handle parenthesized values: either arrays like (a,b,c) or key=value pairs (k=v,...)
    if (value.startsWith("(") && value.endsWith(")")) {
      const inner = value.slice(1, -1).trim();
      // if inner contains '=' then it's a map-like structure
      if (inner.includes("=")) {
        const obj: Record<string, unknown> = {};
        const pairs = splitRespectingQuotes(inner, ',');
        for (const p of pairs) {
          const eq = p.indexOf('=');
          if (eq === -1) {
            continue;
          }
          const sk = p.slice(0, eq).trim();
          const svRaw = p.slice(eq + 1).trim();
          obj[sk] = parseTokenValue(svRaw);
        }
        if (currentSection) {
          const sec = result[currentSection] as Record<string, unknown>;
          sec[key] = obj;
        } else {
          result[key] = obj;
        }
        continue;
      }

      // Otherwise treat as simple array
      const items = splitRespectingQuotes(inner, ',').map((it) => parseTokenValue(it));
      if (currentSection) {
        const sec = result[currentSection] as Record<string, unknown>;
        sec[key] = items;
      } else {
        result[key] = items;
      }
      continue;
    }

    // plain primitive value
    const parsed = parseTokenValue(value);
    if (currentSection) {
      const sec = result[currentSection] as Record<string, unknown>;
      sec[key] = parsed;
    } else {
      result[key] = parsed;
    }
  }

  return result;
}

function stringifyIniContent(content: Record<string, unknown>): string {
  const escapeIfNeeded = (s: string) => {
    if (s === "") {
      return '""';
    }
    if (s.includes(' ') || s.includes(',') || s.includes('"')) {
      return `"${s.replace(/"/g, '\\"')}"`;
    }
    return s;
  };

  let out = "";
  for (const [k, v] of Object.entries(content)) {
    // sections (objects) produce [section] blocks
    if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
      out += `[${k}]\n`;
      const section = v as Record<string, unknown>;
      for (const [sk, sv] of Object.entries(section)) {
        // If the section value is an object or array, serialize as parenthesized tuple or key=value list
        if (Array.isArray(sv)) {
          const items = sv.map((it) => {
            if (typeof it === 'string') {
              return escapeIfNeeded(it);
            }
            return String(it);
          });
          out += `${sk}=(${items.join(',')})\n`;
        } else if (typeof sv === 'object' && sv !== null) {
          const pairs: string[] = [];
          for (const [k2, v2] of Object.entries(sv as Record<string, unknown>)) {
            const valStr = typeof v2 === 'string' ? escapeIfNeeded(v2) : String(v2);
            pairs.push(`${k2}=${valStr}`);
          }
          out += `${sk}=(${pairs.join(',')})\n`;
        } else {
          out += `${sk}=${String(sv)}\n`;
        }
      }
      out += "\n";
    } else {
      // top-level primitive or array
      if (Array.isArray(v)) {
        const items = v.map((it) => (typeof it === 'string' ? escapeIfNeeded(it) : String(it)));
        out += `${k}=(${items.join(',')})\n`;
      } else {
        out += `${k}=${String(v)}\n`;
      }
    }
  }
  return out;
}

// Remove the application menu so the app has no native top menu bar
Menu.setApplicationMenu(null);
