import type { AutoUpdateServerResponse } from "../types/ipc";

/**
 * Card-level notice for the last auto-update check (epic 042.5). Deferrals
 * and failures stay visible until a later check succeeds — the page-level
 * error banner is cleared by the next server poll a few seconds later.
 * Returns null when there is nothing to show.
 */
export function describeAutoUpdateNotice(
  result: AutoUpdateServerResponse
): string | null {
  if (result.stage === "deferred") {
    const players = result.playersOnline ?? 0;
    const noun = players === 1 ? "player" : "players";
    return `Update available — waiting for ${String(players)} ${noun} to leave. Rechecking every 5 minutes.`;
  }
  if (!result.success) {
    return `Last auto-update check failed at ${result.stage}: ${result.error ?? "Unknown error"}`;
  }
  return null;
}
