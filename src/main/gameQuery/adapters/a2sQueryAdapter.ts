import { isIPv4 } from "net";
import os from "os";

import type { ServerQueryMetadata } from "../../catalog/serverCapabilities";
import { queryA2sInfo, queryA2sPlayers } from "../a2sClient";
import type {
  GameQueryAdapter,
  GameQuerySnapshotResult,
  GameQueryTarget,
  UdpExchange,
} from "../types";

const LOOPBACK_HOST = "127.0.0.1";
const WILDCARD_HOST = "0.0.0.0";

function parsePort(raw: unknown, defaultPort: number): number {
  const port =
    typeof raw === "number"
      ? raw
      : typeof raw === "string" && raw.trim() !== ""
        ? Number(raw)
        : Number.NaN;
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    return defaultPort;
  }
  return port;
}

function isLocalAddress(host: string): boolean {
  if (host.startsWith("127.")) {
    return true;
  }
  return Object.values(os.networkInterfaces()).some(
    (addresses) =>
      addresses?.some((address) => address.address === host) ?? false
  );
}

/**
 * Query the address the server binds to: a specific IPv4 bind address owned
 * by this machine is queried directly; the wildcard, a non-IPv4 value, or an
 * address this machine does not have (the server could not bind it anyway)
 * falls back to loopback, so config can never aim the query off-host.
 */
function resolveHost(raw: unknown): string {
  if (typeof raw !== "string") {
    return LOOPBACK_HOST;
  }
  const host = raw.trim();
  if (!isIPv4(host) || host === WILDCARD_HOST || !isLocalAddress(host)) {
    return LOOPBACK_HOST;
  }
  return host;
}

/**
 * Steam A2S query adapter (epic 042) — Enshrouded is the first catalog user.
 * Port/bind-address config keys and the default port come from catalog
 * `server_query_metadata`; only top-level config keys are read.
 */
export const a2sQueryAdapter: GameQueryAdapter = {
  id: "a2s",

  extractTarget(
    content: Record<string, unknown>,
    metadata: ServerQueryMetadata
  ): GameQueryTarget {
    if (metadata.adapterId !== "a2s") {
      throw new Error(
        `a2sQueryAdapter cannot handle adapter_id "${metadata.adapterId}"`
      );
    }
    return {
      host:
        metadata.hostConfigKey === null
          ? LOOPBACK_HOST
          : resolveHost(content[metadata.hostConfigKey]),
      port: parsePort(content[metadata.portConfigKey], metadata.defaultPort),
    };
  },

  async querySnapshot(
    target: GameQueryTarget,
    exchange?: UdpExchange
  ): Promise<GameQuerySnapshotResult> {
    const info = await queryA2sInfo(target, { exchange });
    if (!info.ok) {
      return { success: false, errorKind: info.kind, error: info.error };
    }

    const snapshot: GameQuerySnapshotResult = {
      success: true,
      info: {
        serverName: info.value.name,
        map: info.value.map,
        game: info.value.game,
        version: info.value.version,
        players: info.value.players,
        maxPlayers: info.value.maxPlayers,
        bots: info.value.bots,
        passwordProtected: info.value.passwordProtected,
      },
    };

    const players = await queryA2sPlayers(target, { exchange });
    if (!players.ok) {
      return { ...snapshot, players: null, playersError: players.error };
    }
    return {
      ...snapshot,
      players: players.value.map((player) => ({
        name: player.name,
        score: player.score,
        durationSeconds: player.durationSeconds,
      })),
    };
  },
};
