import { useCallback, useEffect, useRef, useState } from "react";

import type { ServerPersistedSettings, SteamServer } from "../../types/ipc";

const DEFAULT_BACKUP_INTERVAL_SECONDS = 3600;

interface UseServerBackupsOptions {
  servers: SteamServer[];
  /**
   * Persisted per-server settings keyed by stringified appId. Values are
   * typed as possibly undefined because lookups may miss (the compiler does
   * not check index access).
   */
  serversSettings: Record<string, ServerPersistedSettings | undefined>;
  setBackupPath: (appId: number, path: string) => void;
  onError: (message: string) => void;
}

interface UseServerBackupsResult {
  lastBackups: Record<number, string>;
  backupNow: (appId: number, installPath: string) => void;
  selectBackupFolder: (appId: number) => void;
}

export function useServerBackups(
  options: UseServerBackupsOptions
): UseServerBackupsResult {
  const { servers, serversSettings, setBackupPath, onError } = options;

  const [lastBackups, setLastBackups] = useState<Record<number, string>>({});

  // Consumed via refs so the exposed callbacks stay stable and the
  // auto-backup effect only depends on the data that shapes its intervals.
  const serversSettingsRef = useRef(serversSettings);
  const onErrorRef = useRef(onError);
  const setBackupPathRef = useRef(setBackupPath);

  useEffect(() => {
    serversSettingsRef.current = serversSettings;
    onErrorRef.current = onError;
    setBackupPathRef.current = setBackupPath;
  }, [serversSettings, onError, setBackupPath]);

  const runBackup = useCallback(
    async (
      appId: number,
      installPath: string,
      backupPath: string
    ): Promise<void> => {
      try {
        const result = await window.electron.backupServerSave(
          appId,
          installPath,
          backupPath
        );
        if (!result.success && result.error !== undefined) {
          onErrorRef.current(result.error);
          return;
        }
        if (result.backupPath !== undefined) {
          setLastBackups((prev) => ({
            ...prev,
            [appId]: new Date().toLocaleString(),
          }));
        }
      } catch (err) {
        const errorMsg =
          err instanceof Error ? err.message : "Failed to create backup";
        console.error("Failed to backup server:", err);
        onErrorRef.current(errorMsg);
      }
    },
    []
  );

  const backupNow = useCallback(
    (appId: number, installPath: string): void => {
      const backupPath = serversSettingsRef.current[String(appId)]?.backupPath;
      if (backupPath === undefined || backupPath === "") {
        onErrorRef.current("Please set a backup location first");
        return;
      }
      void runBackup(appId, installPath, backupPath);
    },
    [runBackup]
  );

  const selectBackupFolder = useCallback((appId: number): void => {
    void (async (): Promise<void> => {
      try {
        const result = await window.electron.selectBackupFolder();
        if (result.success && result.path !== null) {
          setBackupPathRef.current(appId, result.path);
        } else if (result.error !== undefined) {
          onErrorRef.current(result.error);
        }
      } catch (err) {
        const errorMsg =
          err instanceof Error ? err.message : "Failed to select folder";
        console.error("Failed to select backup folder:", err);
        onErrorRef.current(errorMsg);
      }
    })();
  }, []);

  // Automatic backups for running servers with a configured location.
  useEffect(() => {
    const intervals: ReturnType<typeof setInterval>[] = [];

    servers.forEach((server) => {
      const serverSettings = serversSettings[String(server.appId)];
      const backupPath = serverSettings?.backupPath;
      const intervalSeconds =
        serverSettings?.backupIntervalSeconds ??
        DEFAULT_BACKUP_INTERVAL_SECONDS;

      if (
        intervalSeconds > 0 &&
        server.isRunning &&
        backupPath !== undefined &&
        backupPath !== ""
      ) {
        const interval = setInterval(() => {
          console.warn(`Auto-backing up ${server.name}...`);
          void runBackup(server.appId, server.installPath, backupPath);
        }, intervalSeconds * 1000);

        intervals.push(interval);
      }
    });

    return (): void => {
      intervals.forEach((interval) => clearInterval(interval));
    };
  }, [servers, serversSettings, runBackup]);

  return {
    lastBackups,
    backupNow,
    selectBackupFolder,
  };
}
