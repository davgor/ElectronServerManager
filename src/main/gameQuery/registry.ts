import type { GameQueryAdapter } from "./types";

const adapters = new Map<string, GameQueryAdapter>();

/** Register a query adapter (idempotent by id — last write wins). */
export function registerGameQueryAdapter(adapter: GameQueryAdapter): void {
  adapters.set(adapter.id, adapter);
}

export function getGameQueryAdapter(
  adapterId: string
): GameQueryAdapter | null {
  return adapters.get(adapterId) ?? null;
}

/** Test helper: clear the process-wide adapter registry. */
export function resetGameQueryAdaptersForTests(): void {
  adapters.clear();
}
