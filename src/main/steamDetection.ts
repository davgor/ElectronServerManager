import { promises as fs } from "fs";
import path from "path";
import { execSync } from "child_process";

import * as logger from "./logger";

export interface SteamServer {
  name: string;
  appId: number;
  installPath: string;
  isRunning: boolean;
  coverArt?: string;
}

export interface ServerInfo {
  name: string;
  folderName?: string | null;
  /** Default executable, used when no platform-specific override matches */
  executable: string;
  /** Per-platform executable overrides (e.g. PalServer.sh on linux) */
  executables?: Partial<Record<NodeJS.Platform, string>>;
  /** Default save location, relative to the install path */
  saveLocation?: string;
  /** Per-platform save location overrides */
  saveLocations?: Partial<Record<NodeJS.Platform, string>>;
  /** Default config location, relative to the install path */
  configLocation?: string;
  /** Per-platform config location overrides */
  configLocations?: Partial<Record<NodeJS.Platform, string>>;
}

/**
 * Known Steam dedicated server applications, keyed by Steam app ID.
 * See docs/ADDING_SERVERS.md for how to add a new entry.
 */
export const STEAM_DEDICATED_SERVERS: Record<number, ServerInfo> = {
  // Enshrouded ships a Windows-only server binary; on Linux it is typically
  // run through Wine/Proton against the same .exe, so no override is defined.
  2278520: {
    name: "Enshrouded Dedicated Server",
    folderName: "EnshroudedServer",
    executable: "enshrouded_server.exe",
    saveLocation: "savegame",
    configLocation: "enshrouded_server.json",
  },
  1623730: {
    name: "Palworld Dedicated Server",
    folderName: "PalServer",
    executable: "PalServer.exe",
    executables: {
      linux: "PalServer.sh",
    },
    saveLocation: "Pal/Saved/SaveGames",
    configLocation: "Pal/Saved/Config/WindowsServer/PalWorldSettings.ini",
    configLocations: {
      linux: "Pal/Saved/Config/LinuxServer/PalWorldSettings.ini",
    },
  },
};

/**
 * Resolve the executable for a server on the given platform,
 * falling back to the default executable when no override exists.
 */
export function resolveServerExecutable(
  serverInfo: ServerInfo,
  platform: NodeJS.Platform = process.platform
): string {
  return serverInfo.executables?.[platform] ?? serverInfo.executable;
}

/**
 * Resolve the config file location for a server on the given platform,
 * falling back to the default config location when no override exists.
 */
export function resolveServerConfigLocation(
  serverInfo: ServerInfo,
  platform: NodeJS.Platform = process.platform
): string | undefined {
  return serverInfo.configLocations?.[platform] ?? serverInfo.configLocation;
}

/**
 * Resolve the save location for a server on the given platform,
 * falling back to the default save location when no override exists.
 */
export function resolveServerSaveLocation(
  serverInfo: ServerInfo,
  platform: NodeJS.Platform = process.platform
): string | undefined {
  return serverInfo.saveLocations?.[platform] ?? serverInfo.saveLocation;
}

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
export async function parseLibraryFolders(
  steamPath: string
): Promise<string[]> {
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

const COVER_ART_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

type CoverArtCacheEntry = {
  value: string | undefined;
  expiresAt: number;
};

const coverArtCache = new Map<number, CoverArtCacheEntry>();

/** Deterministic Steam CDN header image URL (no network). */
export function steamCoverArtUrl(appId: number): string {
  return `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/header.jpg`;
}

/** Clear the in-memory cover-art validation cache (tests / forced refresh). */
export function clearCoverArtCache(): void {
  coverArtCache.clear();
}

/**
 * Validate cover art for a Steam game via CDN HEAD, with in-memory TTL cache.
 * Server scan uses {@link steamCoverArtUrl} instead so it never blocks on HEAD.
 */
export async function fetchCoverArt(
  appId: number
): Promise<string | undefined> {
  const now = Date.now();
  const cached = coverArtCache.get(appId);
  if (cached !== undefined && cached.expiresAt > now) {
    return cached.value;
  }

  const coverUrl = steamCoverArtUrl(appId);
  let value: string | undefined;

  try {
    const response = await fetch(coverUrl, { method: "HEAD" });
    value = response.ok ? coverUrl : undefined;
  } catch (err) {
    logger.debug(
      `Failed to fetch cover art for app ${appId}: ${err instanceof Error ? err.message : String(err)}`
    );
    value = undefined;
  }

  coverArtCache.set(appId, {
    value,
    expiresAt: now + COVER_ART_CACHE_TTL_MS,
  });
  return value;
}

/**
 * Check if a process is running by name
 */
export function isProcessRunning(processName: string): boolean {
  try {
    const platform = process.platform;
    let command: string;

    if (platform === "win32") {
      // Extract just the executable name without extension for tasklist
      const exeName = path.basename(processName);
      command = `tasklist /FI "IMAGENAME eq ${exeName}"`;
      const result = execSync(command, { encoding: "utf8" });
      const isRunning = result.includes(exeName);
      logger.debug(
        `Process check for ${exeName}: ${isRunning ? "RUNNING" : "NOT FOUND"}`
      );
      return isRunning;
    } else if (platform === "darwin" || platform === "linux") {
      command = `pgrep -f "${processName}"`;
      try {
        execSync(command);
        logger.debug(`Process check for ${processName}: RUNNING`);
        return true;
      } catch {
        logger.debug(`Process check for ${processName}: NOT FOUND`);
        return false;
      }
    }

    return false;
  } catch (err) {
    logger.error(
      `Error checking process: ${err instanceof Error ? err.message : String(err)}`
    );
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
    logger.warn("Steam installation not found");
    return [];
  }

  if (steamPath === "") {
    logger.warn("Steam installation not found");
    return [];
  }

  logger.debug(`Searching for servers in: ${steamPath}`);

  const libraryPaths = await parseLibraryFolders(steamPath);
  // Filter out any falsy or non-string entries that can appear in test mocks
  const safeLibraryPaths = libraryPaths.filter(
    (p): p is string => typeof p === "string" && p.length > 0
  );
  logger.debug(`Library paths found: ${JSON.stringify(safeLibraryPaths)}`);

  const servers: SteamServer[] = [];

  for (const appId in STEAM_DEDICATED_SERVERS) {
    const serverInfo =
      STEAM_DEDICATED_SERVERS[
        appId as unknown as keyof typeof STEAM_DEDICATED_SERVERS
      ];
    const resolvedExecutable = resolveServerExecutable(serverInfo);
    const serverName = serverInfo.name;
    const expectedFolderName = serverInfo.folderName;
    const appFolder = `${appId}`;

    for (const libraryPath of safeLibraryPaths) {
      const commonPath = path.join(libraryPath, "common");

      // First check if manifest file exists - this confirms the app is installed
      const manifestPath = path.join(libraryPath, `appmanifest_${appId}.acf`);
      let manifestExists = false;

      try {
        await fs.stat(manifestPath);
        manifestExists = true;
        logger.debug(
          `Found manifest for ${serverName} (${appId}) at: ${manifestPath}`
        );
      } catch {
        // Manifest not found, continue
      }

      // If manifest doesn't exist, skip unless we have a known folder name to search for
      if (
        !manifestExists &&
        (expectedFolderName === null || expectedFolderName === undefined)
      ) {
        continue;
      }

      try {
        // Prefer explicit existence checks via fs.stat instead of reading directory
        // This avoids relying on fs.readdir in test environments where it's not mocked.
        // First, check numeric folder name (appFolder) under commonPath
        const numericAppPath = path.join(commonPath, appFolder);
        try {
          await fs.stat(numericAppPath);
          servers.push({
            name: serverName,
            appId: parseInt(appId),
            installPath: numericAppPath,
            isRunning: isProcessRunning(resolvedExecutable),
            coverArt: steamCoverArtUrl(parseInt(appId, 10)),
          });
          logger.debug(
            `✓ Found ${serverName} (numeric folder) at ${numericAppPath}`
          );
          break;
        } catch {
          // numeric folder doesn't exist, continue
        }

        // Next, check the expected folder name if provided
        if (
          expectedFolderName !== null &&
          expectedFolderName !== undefined &&
          expectedFolderName !== ""
        ) {
          const expectedPath = path.join(commonPath, expectedFolderName);
          try {
            await fs.stat(expectedPath);
            servers.push({
              name: serverName,
              appId: parseInt(appId),
              installPath: expectedPath,
              isRunning: isProcessRunning(resolvedExecutable),
              coverArt: steamCoverArtUrl(parseInt(appId, 10)),
            });
            logger.debug(
              `✓ Found ${serverName} (expected folder) at ${expectedPath}`
            );
            break;
          } catch {
            // expected folder doesn't exist, continue
          }
        }

        // If manifest exists, but we couldn't find a specific folder, treat as installing
        if (manifestExists) {
          servers.push({
            name: serverName,
            appId: parseInt(appId),
            installPath: commonPath,
            isRunning: false,
            coverArt: steamCoverArtUrl(parseInt(appId, 10)),
          });
          break;
        }
      } catch (err) {
        logger.debug(
          `Error while checking common directory for ${serverName}: ${err instanceof Error ? err.message : String(err)}`
        );
        // don't add server unless manifestExists
        if (manifestExists) {
          servers.push({
            name: serverName,
            appId: parseInt(appId),
            installPath: commonPath,
            isRunning: false,
            coverArt: steamCoverArtUrl(parseInt(appId, 10)),
          });
          break;
        }
      }
    }
  }

  logger.debug(`Total servers found: ${servers.length}`);
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
        logger.warn(`Could not parse buildid from manifest for app ${appId}`);
        return null;
      }

      logger.debug(`App ${appId} current buildid: ${buildId}`);
      return buildId.toString();
    } catch (err) {
      logger.debug(
        `Could not read manifest for app ${appId}: ${err instanceof Error ? err.message : String(err)}`
      );
      return null;
    }
  } catch (err) {
    logger.error(
      `Error checking buildid for app ${appId}: ${err instanceof Error ? err.message : String(err)}`
    );
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

    const saveLocation = resolveServerSaveLocation(serverInfo);
    if (saveLocation === undefined || saveLocation === "") {
      logger.error(`No save location defined for app ${appId}`);
      return null;
    }

    // Create the save location path
    const savePath = path.join(installPath, saveLocation);

    // Check if save directory exists
    try {
      await fs.stat(savePath);
    } catch {
      logger.error(`Save directory not found: ${savePath}`);
      return null;
    }

    // Create backup directory structure: backupPath/[serverName]/
    const backupDir = path.join(backupPath, serverInfo.name);

    try {
      await fs.mkdir(backupDir, { recursive: true });
    } catch (err) {
      logger.error(
        `Failed to create backup directory: ${err instanceof Error ? err.message : String(err)}`
      );
      return null;
    }

    // Generate timestamp filename
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, "-").slice(0, -5); // YYYY-MM-DDTHH-mm-ss
    const backupFile = path.join(backupDir, `${timestamp}.zip`);

    logger.debug(`Creating backup from ${savePath} to ${backupFile}`);

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

      logger.debug(`Backup created successfully: ${backupFile}`);
      return backupFile;
    } catch (err) {
      logger.error(
        `Failed to create backup: ${err instanceof Error ? err.message : String(err)}`
      );
      return null;
    }
  } catch (err) {
    logger.error(
      `Error during backup: ${err instanceof Error ? err.message : String(err)}`
    );
    return null;
  }
}
