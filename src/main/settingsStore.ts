import Store from "electron-store";

import type { AppSettings, GetSettingsResponse } from "../types/ipc";

import * as logger from "./logger";

/**
 * Lazily created so importing this module never crashes outside a running
 * Electron app (e.g. in unit tests or type-check-only contexts).
 */
let store: Store<AppSettings> | null = null;

function getStore(): Store<AppSettings> {
  if (store === null) {
    store = new Store<AppSettings>({
      name: "settings",
      defaults: { servers: {} },
    });
  }
  return store;
}

/** Drops the cached Store instance so tests can start from a clean slate. */
export function resetSettingsStoreForTests(): void {
  store = null;
}

export function getSettings(): GetSettingsResponse {
  try {
    const defaults: AppSettings = { servers: {} };
    const stored = getStore().store;
    return {
      success: true,
      settings: { ...defaults, ...stored },
    };
  } catch (error) {
    logger.error("Failed to load settings:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to load settings",
      settings: { servers: {} },
    };
  }
}

export function saveSettings(settings: AppSettings): {
  success: boolean;
  error?: string;
} {
  try {
    getStore().store = settings;
    return { success: true };
  } catch (error) {
    logger.error("Failed to save settings:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to save settings",
    };
  }
}
