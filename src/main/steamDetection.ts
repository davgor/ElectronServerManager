import { promises as fs, Dirent } from "fs";
import path from "path";
import { execSync } from "child_process";

export interface SteamServer {
  name: string;
  appId: number;
  installPath: string;
  isRunning: boolean;
  coverArt?: string;
}

/**
 * Known Steam dedicated server applications
 * Format: { appId: number, name: string }
 */
const STEAM_DEDICATED_SERVERS = {
  2278520: {
    name: "Enshrouded Dedicated Server",
    folderName: "EnshroudedServer",
    executable: "enshrouded_server.exe",
    saveLocation: "savegame",
  },
  892970: {
    name: "Valheim Server",
    folderName: "Valheim dedicated server",
    executable: "valheim_server.exe",
    saveLocation: "savegame",
  },
  1623730: {
    name: "Palworld Dedicated Server",
    folderName: "PalServer",
    executable: "pal_server.exe",
    saveLocation: "savegame",
  },
};

/**
 * Find the Steam installation directory on a specific drive (Windows)
 */
async function findSteamPathOnDrive(
  driveLetter: string
): Promise<string | null> {
  const commonSteamPaths = [
    path.join(driveLetter, "Program Files (x86)", "Steam"),
    path.join(driveLetter, "Program Files", "Steam"),
    path.join(driveLetter, "Steam"),
    path.join(driveLetter, "Games", "Steam"),
  ];

  for (const steamPath of commonSteamPaths) {
    try {
      await fs.stat(steamPath);
      return steamPath;
    } catch {
      // Path doesn't exist, continue
    }
  }

  return null;
}

/**
 * Find the Steam installation directory
 */
async function findSteamPath(): Promise<string | null> {
  const platform = process.platform;

  if (platform === "win32") {
    // Windows: Check common registry location
    try {
      const result = execSync(
        'reg query "HKEY_CURRENT_USER\\Software\\Valve\\Steam" /v SteamPath',
        { encoding: "utf8" }
      );
      const match = result.match(/SteamPath\s+REG_SZ\s+(.+)/);
      if (match) {
        return match[1].trim();
      }
    } catch (e) {
      // Fallback to common paths
      const commonPaths = [
        "C:\\Program Files (x86)\\Steam",
        "C:\\Program Files\\Steam",
        path.join(process.env.PROGRAMFILES ?? "C:\\Program Files", "Steam"),
      ];

      for (const steamPath of commonPaths) {
        try {
          await fs.stat(steamPath);
          return steamPath;
        } catch {
          // Path doesn't exist, continue
        }
      }
    }
  } else if (platform === "darwin") {
    // macOS
    const macPath = path.join(
      process.env.HOME ?? "",
      "Library/Application Support/Steam"
    );
    try {
      await fs.stat(macPath);
      return macPath;
    } catch {
      return null;
    }
  } else if (platform === "linux") {
    // Linux
    const linuxPath = path.join(process.env.HOME ?? "", ".steam/steam");
    try {
      await fs.stat(linuxPath);
      return linuxPath;
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Parse a SteamApps libraryfolders.vdf file
 */
async function parseLibraryFolders(steamPath: string): Promise<string[]> {
  const libraryFile = path.join(steamPath, "steamapps/libraryfolders.vdf");
  const libraryPaths: string[] = [path.join(steamPath, "steamapps")];

  try {
    const content = await fs.readFile(libraryFile, "utf8");
    const pathMatches = content.match(/"path"\s+"([^"]+)"/g);

    if (pathMatches) {
      for (const match of pathMatches) {
        const libraryPath = match.replace(/"path"\s+"/, "").replace(/"$/, "");
        if (libraryPath) {
          libraryPaths.push(path.join(libraryPath, "steamapps"));
        }
      }
    }
  } catch (e) {
    // libraryfolders.vdf might not exist, continue with default path
  }

  return libraryPaths;
}

/**
 * Fetch cover art for a Steam game from Steam CDN
 */
async function fetchCoverArt(appId: number): Promise<string | undefined> {
  try {
    // Use Steam's CDN directly for app header images
    // Format: https://cdn.akamai.steamstatic.com/steam/apps/{appId}/header.jpg
    const coverUrl = `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/header.jpg`;

    // Validate the URL works with a HEAD request
    const response = await fetch(coverUrl, { method: "HEAD" });
    if (response.ok) {
      return coverUrl;
    }
    return undefined;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.log(
      `Failed to fetch cover art for app ${appId}: ${err instanceof Error ? err.message : String(err)}`
    );
    return undefined;
  }
}

/**
 * Check if a process is running by name
 */
function isProcessRunning(processName: string): boolean {
  try {
    const platform = process.platform;
    let command: string;

    if (platform === "win32") {
      // Extract just the executable name without extension for tasklist
      const exeName = path.basename(processName);
      command = `tasklist /FI "IMAGENAME eq ${exeName}"`;
      const result = execSync(command, { encoding: "utf8" });
      const isRunning = result.includes(exeName);
      // eslint-disable-next-line no-console
      console.log(
        `Process check for ${exeName}: ${isRunning ? "RUNNING" : "NOT FOUND"}`
      );
      return isRunning;
    } else if (platform === "darwin" || platform === "linux") {
      command = `pgrep -f "${processName}"`;
      try {
        execSync(command);
        // eslint-disable-next-line no-console
        console.log(`Process check for ${processName}: RUNNING`);
        return true;
      } catch {
        // eslint-disable-next-line no-console
        console.log(`Process check for ${processName}: NOT FOUND`);
        return false;
      }
    }

    return false;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`Error checking process: ${err}`);
    return false;
  }
}

/**
 * Find all installed Steam dedicated servers at a specific path or on a specific drive
 * @param pathOrDrive Optional full path to Steam folder or drive letter (e.g., "C:", "D:")
 */
export async function findInstalledServers(
  pathOrDrive?: string
): Promise<SteamServer[]> {
  let steamPath: string | null;

  if (pathOrDrive !== undefined) {
    // Check if it's a full path (contains / or \) or a drive letter
    if (pathOrDrive.includes("/") || pathOrDrive.includes("\\")) {
      // It's a full path, use it directly
      steamPath = pathOrDrive;
    } else {
      // It's a drive letter, search for Steam on that drive
      steamPath = await findSteamPathOnDrive(pathOrDrive);
    }
  } else {
    // Use default Steam path
    steamPath = await findSteamPath();
  }

  if (steamPath === null) {
    console.warn("Steam installation not found");
    return [];
  }

  if (steamPath === "") {
    console.warn("Steam installation not found");
    return [];
  }

  // eslint-disable-next-line no-console
  console.log(`Searching for servers in: ${steamPath}`);

  const libraryPaths = await parseLibraryFolders(steamPath);
  // eslint-disable-next-line no-console
  console.log(`Library paths found: ${JSON.stringify(libraryPaths)}`);

  const servers: SteamServer[] = [];

  for (const appId in STEAM_DEDICATED_SERVERS) {
    const serverInfo =
      STEAM_DEDICATED_SERVERS[
        appId as unknown as keyof typeof STEAM_DEDICATED_SERVERS
      ];
    const serverName = serverInfo.name;
    const expectedFolderName = serverInfo.folderName;
    const appFolder = `${appId}`;

    for (const libraryPath of libraryPaths) {
      const commonPath = path.join(libraryPath, "common");

      // First check if manifest file exists - this confirms the app is installed
      const manifestPath = path.join(libraryPath, `appmanifest_${appId}.acf`);
      let manifestExists = false;

      try {
        await fs.stat(manifestPath);
        manifestExists = true;
        // eslint-disable-next-line no-console
        console.log(
          `Found manifest for ${serverName} (${appId}) at: ${manifestPath}`
        );
      } catch {
        // Manifest not found, continue
      }

      // If manifest doesn't exist, skip unless we have a known folder name to search for
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (!manifestExists && expectedFolderName === null) {
        continue;
      }

      try {
        const dirents = await fs.readdir(commonPath, {
          withFileTypes: true,
        });

        // eslint-disable-next-line no-console
        console.log(
          `Searching in ${commonPath} for ${serverName} (appId: ${appId}, expectedFolder: ${expectedFolderName})`
        );
        // eslint-disable-next-line no-console
        console.log(
          `Directories found: ${dirents.map((d) => d.name).join(", ")}`
        );

        let matchedFolder: Dirent | undefined;

        // First try: numeric folder name matching appId
        matchedFolder = dirents.find(
          (dirent) => dirent.isDirectory() && dirent.name === appFolder
        );

        // Second try: expected folder name (for manually named folders)
        if (matchedFolder === undefined && expectedFolderName) {
          matchedFolder = dirents.find(
            (dirent) =>
              dirent.isDirectory() &&
              dirent.name.toLowerCase() === expectedFolderName.toLowerCase()
          );
        }

        // Third try: if manifest exists, accept any directory
        if (matchedFolder === undefined && manifestExists) {
          matchedFolder = dirents.find((dirent) => dirent.isDirectory());
        }

        if (matchedFolder !== undefined) {
          const foundPath = path.join(commonPath, matchedFolder.name);
          // eslint-disable-next-line no-console
          console.log(
            `✓ Found ${serverName}: ${matchedFolder.name} at ${foundPath}`
          );
          const coverArt = await fetchCoverArt(parseInt(appId));
          servers.push({
            name: serverName,
            appId: parseInt(appId),
            installPath: foundPath,
            isRunning: isProcessRunning(serverInfo.executable),
            coverArt,
          });
          break;
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.log(
          `Can't read common directory for ${serverName}: ${err instanceof Error ? err.message : String(err)}`
        );
        // If manifest exists but folder is inaccessible, report as installing
        if (manifestExists) {
          const coverArt = await fetchCoverArt(parseInt(appId));
          servers.push({
            name: serverName,
            appId: parseInt(appId),
            installPath: commonPath,
            isRunning: false,
            coverArt,
          });
          break;
        }
      }
    }
  }

  // eslint-disable-next-line no-console
  console.log(`Total servers found: ${servers.length}`);
  return servers;
}

/**
 * Parse the buildid from a Steam app manifest file
 */
function parseBuildIdFromManifest(content: string): number | null {
  // Look for "buildid" "XXXX" pattern in the manifest file
  const match = content.match(/"buildid"\s+"(\d+)"/i);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Get the current buildid for a Steam app
 * Returns the buildid string, or null if it cannot be determined
 */
export async function getServerBuildId(
  appId: number,
  steamPath: string
): Promise<string | null> {
  try {
    const manifestPath = path.join(steamPath, `appmanifest_${appId}.acf`);

    try {
      const content = await fs.readFile(manifestPath, "utf8");
      const buildId = parseBuildIdFromManifest(content);

      if (buildId === null) {
        // eslint-disable-next-line no-console
        console.warn(`Could not parse buildid from manifest for app ${appId}`);
        return null;
      }

      // eslint-disable-next-line no-console
      console.log(`App ${appId} current buildid: ${buildId}`);
      return buildId.toString();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.log(
        `Could not read manifest for app ${appId}: ${err instanceof Error ? err.message : String(err)}`
      );
      return null;
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`Error checking buildid for app ${appId}: ${err}`);
    return null;
  }
}

/**
 * Backup a server's save files to a zip archive
 * @param appId The Steam app ID of the server
 * @param installPath The installation path of the server
 * @param backupPath The base directory where backups should be saved
 * @returns The path to the created backup file, or null if backup failed
 */
export async function backupServerSave(
  appId: number,
  installPath: string,
  backupPath: string
): Promise<string | null> {
  try {
    const serverInfo =
      STEAM_DEDICATED_SERVERS[
        appId as unknown as keyof typeof STEAM_DEDICATED_SERVERS
      ];

    if (!serverInfo) {
      // eslint-disable-next-line no-console
      console.error(`Unknown server app ID: ${appId}`);
      return null;
    }

    // Create the save location path
    const savePath = path.join(installPath, serverInfo.saveLocation);

    // Check if save directory exists
    try {
      await fs.stat(savePath);
    } catch {
      // eslint-disable-next-line no-console
      console.error(`Save directory not found: ${savePath}`);
      return null;
    }

    // Create backup directory structure: backupPath/[serverName]/
    const backupDir = path.join(backupPath, serverInfo.name);

    try {
      await fs.mkdir(backupDir, { recursive: true });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`Failed to create backup directory: ${err}`);
      return null;
    }

    // Generate timestamp filename
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, "-").slice(0, -5); // YYYY-MM-DDTHH-mm-ss
    const backupFile = path.join(backupDir, `${timestamp}.zip`);

    // eslint-disable-next-line no-console
    console.log(`Creating backup from ${savePath} to ${backupFile}`);

    // Use platform-specific commands to create zip
    const platform = process.platform;

    try {
      if (platform === "win32") {
        // Windows: Use PowerShell Compress-Archive with proper quoting
        // Using single quotes around paths to avoid issues with spaces
        const psCommand = `Compress-Archive -Path '${savePath}' -DestinationPath '${backupFile}' -Force`;
        execSync(`powershell -NoProfile -Command "${psCommand}"`, {
          shell: "powershell.exe",
        });
      } else if (platform === "darwin" || platform === "linux") {
        // macOS/Linux: Use zip command
        execSync(`zip -r "${backupFile}" "${savePath}"`);
      }

      // eslint-disable-next-line no-console
      console.log(`Backup created successfully: ${backupFile}`);
      return backupFile;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`Failed to create backup: ${err}`);
      return null;
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`Error during backup: ${err}`);
    return null;
  }
}
