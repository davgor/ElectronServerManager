import { palworldRestAdapter } from "./adapters/palworldRestAdapter";
import { registerGameRestAdapter } from "./registry";

let registered = false;

/** Ensure the built-in Palworld REST adapter is registered (idempotent). */
export function ensureDefaultGameRestAdapters(): void {
  if (registered) {
    return;
  }
  registerGameRestAdapter(palworldRestAdapter);
  registered = true;
}

/** Test helper: allow re-registration after registry reset. */
export function resetDefaultGameRestAdaptersForTests(): void {
  registered = false;
}
