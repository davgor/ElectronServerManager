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
