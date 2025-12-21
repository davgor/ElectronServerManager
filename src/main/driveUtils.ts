import { execSync } from "child_process";
import { existsSync } from "fs";
import { join } from "path";

/**
 * Get list of available drives on the system
 */
export function getAvailableDrives(): string[] {
  try {
    const platform = process.platform;

    if (platform === "win32") {
      // Windows: Get drives using fsutil
      const output = execSync("fsutil fsinfo drives", {
        encoding: "utf8",
      });
      const drives: string[] = [];

      // Match drive letters like C:, D:, E: etc
      const matches = output.match(/[A-Z]:\\/g);
      if (matches) {
        matches.forEach((drive) => {
          const driveLetter = drive.replace("\\", "");
          drives.push(driveLetter);
        });
      }

      // If no drives found, return default
      if (drives.length === 0) {
        return ["C:"];
      }

      return drives.sort();
    } else if (platform === "darwin") {
      // macOS: Return common mount points
      return ["/Volumes"];
    } else if (platform === "linux") {
      // Linux: Return common mount points
      return ["/mnt", "/media"];
    }

    return ["C:"];
  } catch (error) {
    console.error("Error getting available drives:", error);
    return ["C:"];
  }
}

/**
 * Get common Steam installation paths across all drives
 */
export function getCommonSteamPaths(): string[] {
  const platform = process.platform;
  const paths: string[] = [];
  const drives = getAvailableDrives();

  let commonPaths: (drive: string) => string[];

  if (platform === "win32") {
    commonPaths = (drive: string) => [
      join(drive, "\\Program Files\\Steam"),
      join(drive, "\\Program Files (x86)\\Steam"),
      join(drive, "\\SteamLibrary"),
    ];
  } else if (platform === "darwin") {
    commonPaths = (drive: string) => [
      join(drive, "Library/Application Support/Steam"),
      join(drive, ".steam"),
    ];
  } else {
    // Linux and others
    commonPaths = (drive: string) => [
      join(drive, ".steam"),
      join(drive, ".var/app/com.valvesoftware.Steam"),
    ];
  }

  // Check common paths on each drive
  drives.forEach((drive) => {
    const drivePaths = commonPaths(drive);
    drivePaths.forEach((p) => {
      if (existsSync(p)) {
        paths.push(p);
      }
    });
  });

  // If no paths found, return empty array
  return paths;
}
