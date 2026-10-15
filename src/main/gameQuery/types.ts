import type { ServerQueryMetadata } from "../catalog/serverCapabilities";
import type { GameQuerySnapshotResponse } from "../../types/ipc";

/** Host/port a game query is sent to, resolved from the server config. */
export interface GameQueryTarget {
  host: string;
  port: number;
}

/**
 * Send one UDP datagram and resolve with the first datagram received back.
 * Rejects with `UdpExchangeError` on timeout or socket failure. Injectable so
 * protocol code is unit-testable without a live server.
 */
export type UdpExchange = (
  payload: Buffer,
  target: GameQueryTarget,
  timeoutMs: number
) => Promise<Buffer>;

/** Query snapshot fields an adapter produces (target fields added by IPC). */
export type GameQuerySnapshotResult = Omit<
  GameQuerySnapshotResponse,
  "host" | "port"
>;

/**
 * Per-game query protocol adapter (epic 042). Catalog
 * `server_query_metadata.adapter_id` selects which adapter resolves the query
 * target from config and talks to the server — the sibling of `gameRest`
 * adapters for games without an HTTP admin API.
 */
export interface GameQueryAdapter {
  readonly id: string;
  extractTarget(
    content: Record<string, unknown>,
    metadata: ServerQueryMetadata
  ): GameQueryTarget;
  querySnapshot(
    target: GameQueryTarget,
    exchange?: UdpExchange
  ): Promise<GameQuerySnapshotResult>;
}
