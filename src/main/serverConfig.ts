import path from "path";
import { promises as fs } from "fs";

import { STEAM_DEDICATED_SERVERS, ServerInfo } from "./steamDetection";
import { parseIniContent, stringifyIniContent } from "./iniConfig";

interface ConfigReadResult {
  success: boolean;
  content?: Record<string, unknown>;
  format?: "json" | "ini";
  filePath?: string;
  error?: string;
}

interface ConfigWriteResult {
  success: boolean;
  error?: string;
}

type ConfiguredServerInfo = ServerInfo & { configLocation: string };

function getServerConfigInfo(appId: number): ConfiguredServerInfo | null {
  if (
    !Object.prototype.hasOwnProperty.call(
      STEAM_DEDICATED_SERVERS,
      String(appId)
    )
  ) {
    return null;
  }

  const serverInfo = STEAM_DEDICATED_SERVERS[
    appId as unknown as keyof typeof STEAM_DEDICATED_SERVERS
  ] as unknown as ServerInfo;

  if (
    serverInfo.configLocation === undefined ||
    serverInfo.configLocation === ""
  ) {
    return null;
  }

  return serverInfo as ConfiguredServerInfo;
}

export async function getServerConfig(
  appId: number,
  installPath: string
): Promise<ConfigReadResult> {
  try {
    const serverInfo = getServerConfigInfo(appId);
    if (!serverInfo) {
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
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function saveServerConfig(
  appId: number,
  installPath: string,
  content: Record<string, unknown>,
  format: "json" | "ini"
): Promise<ConfigWriteResult> {
  try {
    const serverInfo = getServerConfigInfo(appId);
    if (!serverInfo) {
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
