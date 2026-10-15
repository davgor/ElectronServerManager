import { a2sQueryAdapter } from "./adapters/a2sQueryAdapter";
import { getGameQueryAdapter, registerGameQueryAdapter } from "./registry";

/**
 * Ensure the built-in Steam A2S query adapter is registered (idempotent).
 * Checks the registry rather than a one-shot flag so a registry reset (tests)
 * is healed on the next call without importing this module up front.
 */
export function ensureDefaultGameQueryAdapters(): void {
  if (getGameQueryAdapter(a2sQueryAdapter.id) !== null) {
    return;
  }
  registerGameQueryAdapter(a2sQueryAdapter);
}
