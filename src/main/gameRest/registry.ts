import type { GameRestAdapter } from "./types";

const adapters = new Map<string, GameRestAdapter>();

/** Register a REST adapter (idempotent by id — last write wins). */
export function registerGameRestAdapter(adapter: GameRestAdapter): void {
  adapters.set(adapter.id, adapter);
}

export function getGameRestAdapter(adapterId: string): GameRestAdapter | null {
  return adapters.get(adapterId) ?? null;
}

/** Test helper: clear the process-wide adapter registry. */
export function resetGameRestAdaptersForTests(): void {
  adapters.clear();
}
