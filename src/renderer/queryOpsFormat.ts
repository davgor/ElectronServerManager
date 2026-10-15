/** Display helpers for game-query (Steam A2S) live ops and Admin (epic 042). */

import type {
  GameQueryErrorKind,
  GameQueryInfo,
  GameQueryPlayer,
  GameQuerySnapshotResponse,
} from "../types/ipc";

const NOT_AVAILABLE = "—";
const UNNAMED_PLAYER = "(name not reported)";
const GENERIC_QUERY_ERROR = "Server query failed";

/**
 * Hover note for the A2S "version" string: servers fill it with their own
 * value (Enshrouded 1.0 reports 0.0.15.0), so it must not read as the game
 * version.
 */
export const REPORTED_VERSION_HINT =
  "Version string the server reports over the Steam server query. It is not necessarily the game version.";

const DEFAULT_ERROR_MESSAGES: Record<GameQueryErrorKind, string> = {
  unavailable: "Live query is not available for this server",
  config: "Server config could not be read",
  timeout: "No response from the server query port",
  network: "Network error while querying the server",
  empty: "The server sent an empty query response",
  parse: "The server query response could not be parsed",
};

function padTwo(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * Time a player has been connected: "42s", "5m 03s", "1h 02m". Fractions are
 * truncated; negative or non-finite durations render as a dash.
 */
export function formatPlayerDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return NOT_AVAILABLE;
  }
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainder = total % 60;
  if (hours > 0) {
    return `${hours}h ${padTwo(minutes)}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${padTwo(remainder)}s`;
  }
  return `${remainder}s`;
}

/** Online vs. maximum players, e.g. "2/16". */
export function formatPlayerCount(
  info: Pick<GameQueryInfo, "players" | "maxPlayers">
): string {
  return `${info.players}/${info.maxPlayers}`;
}

/**
 * Human-readable query failure combining the error kind and message, e.g.
 * "timeout — No response from 127.0.0.1:15637 within 2000 ms".
 */
export function describeQueryError(
  response: Pick<GameQuerySnapshotResponse, "error" | "errorKind">
): string {
  const message = response.error?.trim() ?? "";
  const kind = response.errorKind;
  if (kind === undefined) {
    return message === "" ? GENERIC_QUERY_ERROR : message;
  }
  return `${kind} — ${message === "" ? DEFAULT_ERROR_MESSAGES[kind] : message}`;
}

/** Player name, or a placeholder when the server did not publish one. */
export function playerDisplayName(player: GameQueryPlayer): string {
  return player.name.trim() === "" ? UNNAMED_PLAYER : player.name;
}

/** Names of players that reported one, in list order. */
export function reportedPlayerNames(
  players: GameQueryPlayer[] | null | undefined
): string[] {
  if (players === null || players === undefined) {
    return [];
  }
  return players
    .filter((player) => player.name.trim() !== "")
    .map((player) => player.name);
}

/**
 * Stable React keys for a player list. A2S rows carry no id, so named players
 * key by name (with an occurrence suffix for duplicates) and unnamed players
 * by their order among unnamed rows.
 */
export function playerRowKeys(players: GameQueryPlayer[]): string[] {
  const seen = new Map<string, number>();
  return players.map((player) => {
    const base = player.name.trim() === "" ? "" : player.name;
    const occurrence = seen.get(base) ?? 0;
    seen.set(base, occurrence + 1);
    return `${base === "" ? "unnamed" : `name:${base}`}#${occurrence}`;
  });
}
