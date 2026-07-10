import { useCallback, useMemo, useState } from "react";

import type { SteamServer } from "../types/electron";
import type { ServerPersistedSettings } from "../types/ipc";

import "./App.css";
import { ConfigEditor } from "./ConfigEditor";
import { ServerCard } from "./ServerCard";
import { SteamPathSelector } from "./SteamPathSelector";
import TitleBar from "./TitleBar";
import { useServerBackups } from "./hooks/useServerBackups";
import { useServerSettings } from "./hooks/useServerSettings";
import { useSteamServers } from "./hooks/useSteamServers";

const DEFAULT_BACKUP_INTERVAL_SECONDS = 3600;

function appIdsWithFlag(
  servers: Record<string, { autoRestart: boolean; autoUpdate: boolean }>,
  flag: "autoRestart" | "autoUpdate"
): Set<number> {
  return new Set(
    Object.entries(servers)
      .filter(([, serverSettings]) => serverSettings[flag])
      .map(([appId]) => Number(appId))
  );
}

function App(): JSX.Element {
  const [actionError, setActionError] = useState<string | null>(null);
  const [editingServer, setEditingServer] = useState<SteamServer | null>(null);

  const {
    settings,
    setAutoRestart,
    setAutoUpdate,
    setBackupPath,
    setBackupInterval,
    setSelectedSteamPath,
  } = useServerSettings();

  const autoRestartAppIds = useMemo(
    () => appIdsWithFlag(settings.servers, "autoRestart"),
    [settings.servers]
  );
  const autoUpdateAppIds = useMemo(
    () => appIdsWithFlag(settings.servers, "autoUpdate"),
    [settings.servers]
  );

  const {
    servers,
    loading,
    error,
    refresh,
    availablePaths,
    selectedPath,
    setSelectedPath,
  } = useSteamServers({
    autoRestartAppIds,
    autoUpdateAppIds,
    preferredPath: settings.selectedSteamPath,
  });

  // Widened so per-server lookups honestly type missing entries as undefined
  // (index access is not checked by the compiler).
  const serversSettings: Record<string, ServerPersistedSettings | undefined> =
    settings.servers;

  const { lastBackups, backupNow, selectBackupFolder } = useServerBackups({
    servers,
    serversSettings,
    setBackupPath,
    onError: setActionError,
  });

  const displayedError = error ?? actionError;

  const handleSelectPath = useCallback(
    (path: string): void => {
      setSelectedPath(path);
      setSelectedSteamPath(path);
    },
    [setSelectedPath, setSelectedSteamPath]
  );

  const handleRetry = useCallback((): void => {
    setActionError(null);
    void refresh();
  }, [refresh]);

  const handleRunServer = useCallback(
    (appId: number, installPath: string): void => {
      void (async (): Promise<void> => {
        try {
          const result = await window.electron.runServer(appId, installPath);
          if (!result.success && result.error !== undefined) {
            setActionError(result.error);
            return;
          }
          // Wait a bit for the process to fully start before checking status
          await new Promise((resolve) => setTimeout(resolve, 1000));
          await refresh();
        } catch (err) {
          const errorMsg =
            err instanceof Error ? err.message : "Failed to run server";
          console.error("Failed to run server:", err);
          setActionError(errorMsg);
        }
      })();
    },
    [refresh]
  );

  const handleStopServer = useCallback(
    (appId: number, installPath: string): void => {
      void (async (): Promise<void> => {
        try {
          // Disable auto-restart so the intentional stop is not treated as a
          // crash by the polling loop.
          setAutoRestart(appId, false);

          const result = await window.electron.stopServer(appId, installPath);
          if (!result.success && result.error !== undefined) {
            setActionError(result.error);
          }
          // The periodic refresh picks up the stopped state.
        } catch (err) {
          const errorMsg =
            err instanceof Error ? err.message : "Failed to stop server";
          console.error("Failed to stop server:", err);
          setActionError(errorMsg);
        }
      })();
    },
    [setAutoRestart]
  );

  const handleEditConfig = useCallback((server: SteamServer): void => {
    setEditingServer(server);
  }, []);

  return (
    <div className="app">
      <TitleBar />
      <div className="container">
        <h1>Steam Server Manager</h1>

        <p>Detected Steam Dedicated Servers</p>

        <SteamPathSelector
          paths={availablePaths}
          selectedPath={selectedPath}
          onSelect={handleSelectPath}
        />

        {displayedError !== null && (
          <div className="error">
            <p>⚠️ {displayedError}</p>
            <button onClick={handleRetry}>Retry</button>
          </div>
        )}

        {!loading && servers.length === 0 && displayedError !== null && (
          <div className="no-servers">
            <p>No Steam dedicated servers found.</p>
            <p>Install a Steam dedicated server to get started.</p>
          </div>
        )}

        {servers.length > 0 && (
          <div className="servers-list">
            <div className="server-count">
              Found {servers.length} server{servers.length !== 1 ? "s" : ""}
            </div>
            <div className="servers">
              {servers.map((server) => {
                const serverSettings = serversSettings[String(server.appId)];
                return (
                  <ServerCard
                    key={server.appId}
                    server={server}
                    autoRestartEnabled={autoRestartAppIds.has(server.appId)}
                    autoUpdateEnabled={autoUpdateAppIds.has(server.appId)}
                    backupPath={serverSettings?.backupPath}
                    backupIntervalSeconds={
                      serverSettings?.backupIntervalSeconds ??
                      DEFAULT_BACKUP_INTERVAL_SECONDS
                    }
                    lastBackup={lastBackups[server.appId]}
                    onRunServer={handleRunServer}
                    onStopServer={handleStopServer}
                    onToggleAutoRestart={setAutoRestart}
                    onToggleAutoUpdate={setAutoUpdate}
                    onSelectBackupFolder={selectBackupFolder}
                    onChangeBackupInterval={setBackupInterval}
                    onBackupNow={backupNow}
                    onEditConfig={handleEditConfig}
                  />
                );
              })}
            </div>
            {editingServer !== null && (
              <ConfigEditor
                appId={editingServer.appId}
                serverName={editingServer.name}
                installPath={editingServer.installPath}
                onClose={() => setEditingServer(null)}
                onSave={() => {
                  void refresh();
                }}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
