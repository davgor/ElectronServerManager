import { useCallback, useEffect, useState } from "react";

import type { AppSettings, ServerPersistedSettings } from "../../types/ipc";

const DEFAULT_SERVER_SETTINGS: ServerPersistedSettings = {
  autoRestart: false,
  autoUpdate: false,
};

export interface UseServerSettingsResult {
  settings: AppSettings;
  settingsLoaded: boolean;
  setAutoRestart: (appId: number, enabled: boolean) => void;
  setAutoUpdate: (appId: number, enabled: boolean) => void;
  setBackupPath: (appId: number, path: string) => void;
  setBackupInterval: (appId: number, seconds: number) => void;
  setSelectedSteamPath: (path: string) => void;
}

function persistSettings(settings: AppSettings): void {
  window.electron.saveSettings(settings).catch((error: unknown) => {
    console.error("Failed to save settings:", error);
  });
}

export function useServerSettings(): UseServerSettingsResult {
  const [settings, setSettings] = useState<AppSettings>({ servers: {} });
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    window.electron
      .getSettings()
      .then((response) => {
        if (cancelled) {
          return;
        }
        if (!response.success) {
          console.error("Failed to load settings:", response.error);
        }
        setSettings(response.settings);
        setSettingsLoaded(true);
      })
      .catch((error: unknown) => {
        console.error("Failed to load settings:", error);
        if (!cancelled) {
          setSettingsLoaded(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const updateSettings = useCallback(
    (compute: (previous: AppSettings) => AppSettings) => {
      setSettings((previous) => {
        const next = compute(previous);
        persistSettings(next);
        return next;
      });
    },
    []
  );

  const updateServer = useCallback(
    (appId: number, patch: Partial<ServerPersistedSettings>) => {
      updateSettings((previous) => {
        const key = String(appId);
        const current = previous.servers[key] ?? DEFAULT_SERVER_SETTINGS;
        return {
          ...previous,
          servers: {
            ...previous.servers,
            [key]: { ...current, ...patch },
          },
        };
      });
    },
    [updateSettings]
  );

  const setAutoRestart = useCallback(
    (appId: number, enabled: boolean) => {
      updateServer(appId, { autoRestart: enabled });
    },
    [updateServer]
  );

  const setAutoUpdate = useCallback(
    (appId: number, enabled: boolean) => {
      updateServer(appId, { autoUpdate: enabled });
    },
    [updateServer]
  );

  const setBackupPath = useCallback(
    (appId: number, path: string) => {
      updateServer(appId, { backupPath: path });
    },
    [updateServer]
  );

  const setBackupInterval = useCallback(
    (appId: number, seconds: number) => {
      updateServer(appId, { backupIntervalSeconds: seconds });
    },
    [updateServer]
  );

  const setSelectedSteamPath = useCallback(
    (path: string) => {
      updateSettings((previous) => ({
        ...previous,
        selectedSteamPath: path,
      }));
    },
    [updateSettings]
  );

  return {
    settings,
    settingsLoaded,
    setAutoRestart,
    setAutoUpdate,
    setBackupPath,
    setBackupInterval,
    setSelectedSteamPath,
  };
}
