/**
 * Catalog capability ids for optional per-game features (REST admin, live ops,
 * announce-before-update). Stored in SQLite `server_capabilities`.
 */

const SERVER_CAPABILITY_IDS = [
  "rest_admin",
  "live_ops",
  "update_announce",
] as const;

export type ServerCapabilityId = (typeof SERVER_CAPABILITY_IDS)[number];

export function isServerCapabilityId(
  value: string
): value is ServerCapabilityId {
  return (SERVER_CAPABILITY_IDS as readonly string[]).includes(value);
}

/** Static REST binding metadata for a game that ships a REST adapter. */
export interface ServerRestMetadata {
  adapterId: string;
  defaultPort: number;
  enabledConfigKey: string;
  portConfigKey: string;
  passwordConfigKey: string;
}

/**
 * Static query binding metadata for a game whose ops surface is a UDP server
 * query (Steam A2S) instead of HTTP (epic 042). There is no enable flag or
 * password: the query listens whenever the server process does.
 */
export interface ServerQueryMetadata {
  adapterId: string;
  defaultPort: number;
  /** Top-level config key holding the query port (e.g. `queryPort`). */
  portConfigKey: string;
  /** Top-level config key holding the bind address, or null when none. */
  hostConfigKey: string | null;
  /** Top-level config key holding in-game admin roles, or null when none. */
  adminConfigKey: string | null;
}
