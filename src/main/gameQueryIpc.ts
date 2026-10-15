import type { GameQuerySnapshotResponse } from "../types/ipc";

import { getCapabilityRepository } from "./catalog/capabilityRepository";
import { ensureDefaultGameQueryAdapters } from "./gameQuery/ensureDefaultAdapters";
import { getGameQueryAdapter } from "./gameQuery/registry";
import type { UdpExchange } from "./gameQuery/types";
import { getServerConfig } from "./serverConfig";

/**
 * Live server query for games whose catalog row carries query metadata
 * (epic 042 — Enshrouded over Steam A2S). Never throws: every failure is a
 * structured `errorKind` so the renderer and the auto-update gate can tell
 * "not supported" from "server did not answer".
 */
export async function getGameQuerySnapshot(
  appId: number,
  installPath: string,
  exchange?: UdpExchange
): Promise<GameQuerySnapshotResponse> {
  ensureDefaultGameQueryAdapters();

  const metadata = getCapabilityRepository().getQueryMetadata(appId);
  if (metadata === null) {
    return {
      success: false,
      errorKind: "unavailable",
      error: "Server query is not available for this server",
    };
  }

  const adapter = getGameQueryAdapter(metadata.adapterId);
  if (adapter === null) {
    return {
      success: false,
      errorKind: "unavailable",
      error: `No query adapter registered for id "${metadata.adapterId}"`,
    };
  }

  const configResult = await getServerConfig(appId, installPath);
  if (!configResult.success || configResult.content === undefined) {
    return {
      success: false,
      errorKind: "config",
      error: configResult.error ?? "Failed to read server config",
    };
  }

  const content: unknown = configResult.content;
  if (
    content === null ||
    typeof content !== "object" ||
    Array.isArray(content)
  ) {
    return {
      success: false,
      errorKind: "config",
      error: "Server config is not a JSON object",
    };
  }

  const target = adapter.extractTarget(
    content as Record<string, unknown>,
    metadata
  );
  const snapshot = await adapter.querySnapshot(target, exchange);
  return { ...snapshot, host: target.host, port: target.port };
}
