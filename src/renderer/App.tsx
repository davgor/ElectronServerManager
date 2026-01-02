import { useCallback, useEffect, useState } from "react";

import type { SteamServer } from "../types/electron";

import "./App.css";
import { ConfigEditor } from "./ConfigEditor";
import TitleBar from "./TitleBar";

function App(): JSX.Element {
  const [servers, setServers] = useState<SteamServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState("");
  const [autoRestartServers, setAutoRestartServers] = useState<Set<number>>(
    new Set()
  );
  const [autoUpdateServers, setAutoUpdateServers] = useState<Set<number>>(
    new Set()
  );
  const [backupLocations, setBackupLocations] = useState<
    Record<number, string>
  >({}); // Per-server backup locations
  const [backupIntervals, setBackupIntervals] = useState<
    Record<number, number>
  >({}); // Per-server intervals
  const [lastBackups, setLastBackups] = useState<Record<number, string>>({});
  const [lastAutoUpdateTime, setLastAutoUpdateTime] = useState<
    Record<number, number>
  >({}); // Track when auto-update was last triggered per server
  const [editingServerAppId, setEditingServerAppId] = useState<number | null>(null);
  const [editingServerInstallPath, setEditingServerInstallPath] = useState<string | null>(null);
  const [editingServerName, setEditingServerName] = useState<string | null>(null);

  const fetchAvailablePaths = useCallback(async (): Promise<void> => {
    try {
      const paths = (await window.electron.ipcRenderer.invoke(
        "get-steam-paths"
      )) as string[];
      if (paths.length > 0) {
        setSelectedPath(paths[0]);
      }
    } catch (err) {
      console.error("Failed to fetch Steam paths:", err);
    }
  }, []);

  // Load backup locations from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem("serverBackupLocations");
      if (saved !== null && saved.length > 0) {
        setBackupLocations(JSON.parse(saved) as Record<number, string>);
      }
    } catch (err) {
      console.error("Failed to load backup locations from localStorage:", err);
    }
  }, []);

  // Save backup locations to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem(
        "serverBackupLocations",
        JSON.stringify(backupLocations)
      );
    } catch (err) {
      console.error("Failed to save backup locations to localStorage:", err);
    }
  }, [backupLocations]);

  const fetchServers = useCallback(
    async (path: string = selectedPath): Promise<void> => {
      setLoading(true);
      setError(null);

      try {
        const result = (await window.electron.ipcRenderer.invoke(
          "get-steam-servers",
          path
        )) as { success: boolean; servers: SteamServer[]; error?: string };

        if (result.success === true) {
          // Check for crashed servers that should auto-restart
          result.servers.forEach((newServer) => {
            const currentServer = servers.find(
              (s) => s.appId === newServer.appId
            );
            // If server was running but is now stopped, and auto-restart is enabled
            if (
              currentServer !== undefined &&
              currentServer.isRunning === true &&
              newServer.isRunning === false &&
              autoRestartServers.has(newServer.appId)
            ) {
              // eslint-disable-next-line no-console
              console.log(
                `Server ${newServer.name} crashed, auto-restarting...`
              );
              // Restart the server
              void (async (): Promise<void> => {
                const restartResult = (await window.electron.ipcRenderer.invoke(
                  "run-server",
                  newServer.appId,
                  newServer.installPath
                )) as { success: boolean; error?: string };

                if (!restartResult.success) {
                  setError(
                    `Failed to auto-restart ${newServer.name}: ${restartResult.error ?? "Unknown error"}`
                  );
                }
              })();
            }

            // Check for updates and auto-update if enabled
            if (
              autoUpdateServers.has(newServer.appId) &&
              newServer.isRunning === true
            ) {
              // Check if we've already triggered auto-update recently (within 5 minutes)
              const now = Date.now();
              const lastUpdateTime = lastAutoUpdateTime[newServer.appId] ?? 0;
              const cooldownPeriod = 5 * 60 * 1000; // 5 minutes in milliseconds

              if (now - lastUpdateTime > cooldownPeriod) {
                // eslint-disable-next-line no-console
                console.log(
                  `Checking for updates for ${newServer.name} (auto-update enabled)...`
                );
                // Update the last auto-update time
                setLastAutoUpdateTime((prev) => ({
                  ...prev,
                  [newServer.appId]: now,
                }));

                // Trigger auto-update
                void (async (): Promise<void> => {
                  const updateResult =
                    (await window.electron.ipcRenderer.invoke(
                      "auto-update-server",
                      newServer.appId,
                      newServer.installPath,
                      path
                    )) as { success: boolean; error?: string };

                  if (!updateResult.success) {
                    setError(
                      `Failed to auto-update ${newServer.name}: ${updateResult.error ?? "Unknown error"}`
                    );
                  }
                })();
              }
            }
          });

          // Always update servers to reflect isRunning status changes
          const hasChanges =
            result.servers.length !== servers.length ||
            result.servers.some((newServer, index) => {
              const currentServer = servers[index];
              // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
              if (currentServer === undefined) {
                return true;
              }
              return (
                newServer.appId !== currentServer.appId ||
                newServer.name !== currentServer.name ||
                newServer.installPath !== currentServer.installPath ||
                newServer.isRunning !== currentServer.isRunning
              );
            });

          if (hasChanges) {
            setServers(result.servers);
          }
        } else {
          setError(result.error ?? "Failed to detect Steam servers");
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "An unexpected error occurred"
        );
      } finally {
        setLoading(false);
      }
    },
    [selectedPath, servers, autoRestartServers, autoUpdateServers, lastAutoUpdateTime]
  );

  const handleRunServer = useCallback(
    (appId: number, installPath: string): void => {
      void (async (): Promise<void> => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call
          const result = (await window.electron.ipcRenderer.invoke(
            "run-server",
            appId,
            installPath
          )) as { success: boolean; error?: string };

          if (!result.success && result.error !== undefined) {
            setError(result.error);
            return;
          }

          // Enable auto-restart for this server
          setAutoRestartServers((prev) => new Set(prev).add(appId));

          // Wait a bit for the process to fully start before checking status
          await new Promise((resolve) => setTimeout(resolve, 1000));

          // Refresh servers to get updated status
          await fetchServers();
        } catch (err) {
          const errorMsg =
            err instanceof Error ? err.message : "Failed to run server";
          console.error("Failed to run server:", err);
          setError(errorMsg);
        }
      })();
    },
    [fetchServers]
  );

  const handleStopServer = useCallback(
    (appId: number, installPath: string): void => {
      void (async (): Promise<void> => {
        try {
          // Disable auto-restart for this server
          setAutoRestartServers((prev) => {
            const next = new Set(prev);
            next.delete(appId);
            return next;
          });

          // eslint-disable-next-line @typescript-eslint/no-unsafe-call
          const result = (await window.electron.ipcRenderer.invoke(
            "stop-server",
            appId,
            installPath
          )) as { success: boolean; error?: string };

          if (!result.success && result.error !== undefined) {
            setError(result.error);
            return;
          }

          // Don't manually refresh here - let the periodic 10-second refresh
          // pick up the change after state has been updated
        } catch (err) {
          const errorMsg =
            err instanceof Error ? err.message : "Failed to stop server";
          console.error("Failed to stop server:", err);
          setError(errorMsg);
        }
      })();
    },
    []
  );

  const handleBackupServer = useCallback(
    (appId: number, installPath: string): void => {
      const serverBackupLocation = backupLocations[appId];
      if (!serverBackupLocation) {
        setError("Please set a backup location first");
        return;
      }

      void (async (): Promise<void> => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call
          const result = (await window.electron.ipcRenderer.invoke(
            "backup-server-save",
            appId,
            installPath,
            serverBackupLocation
          )) as { success: boolean; backupPath?: string; error?: string };

          if (!result.success && result.error !== undefined) {
            setError(result.error);
            return;
          }

          if (result.backupPath !== undefined) {
            // Update last backup time for this server
            setLastBackups((prev) => ({
              ...prev,
              [appId]: new Date().toLocaleString(),
            }));

            // eslint-disable-next-line no-console
            console.log(`Backup created: ${result.backupPath}`);
          }
        } catch (err) {
          const errorMsg =
            err instanceof Error ? err.message : "Failed to create backup";
          console.error("Failed to backup server:", err);
          setError(errorMsg);
        }
      })();
    },
    [backupLocations]
  );

  const handleSelectBackupFolder = useCallback((appId: number): void => {
    void (async (): Promise<void> => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        const result = (await window.electron.ipcRenderer.invoke(
          "select-backup-folder"
        )) as { success: boolean; path?: string; error?: string };

        if (result.success && result.path !== undefined) {
          setBackupLocations((prev) => ({
            ...prev,
            [appId]: result.path!,
          }));
        } else if (result.error !== undefined) {
          setError(result.error);
        }
      } catch (err) {
        const errorMsg =
          err instanceof Error ? err.message : "Failed to select folder";
        console.error("Failed to select backup folder:", err);
        setError(errorMsg);
      }
    })();
  }, []);

  useEffect(() => {
    // Fetch available Steam paths when component mounts
    void fetchAvailablePaths();

    // Periodically check for new Steam installations every 30 seconds
    const pathsInterval = setInterval(() => {
      void fetchAvailablePaths();
    }, 30000);

    return (): void => {
      clearInterval(pathsInterval);
    };
  }, [fetchAvailablePaths]);

  useEffect(() => {
    // Fetch servers when selected path changes
    if (selectedPath) {
      void fetchServers(selectedPath);
    }
  }, [selectedPath, fetchServers]);

  useEffect(() => {
    // Auto-refresh server list every 10 seconds
    if (!selectedPath) {
      return;
    }

    const interval = setInterval(() => {
      void fetchServers(selectedPath);
    }, 10000);

    return (): void => {
      clearInterval(interval);
    };
  }, [selectedPath, fetchServers]);

  useEffect(() => {
    // Set up automatic backup intervals for running servers
    // Create intervals for each server with a configured interval > 0
    const intervals: ReturnType<typeof setInterval>[] = [];

    servers.forEach((server) => {
      const serverInterval = backupIntervals[server.appId] ?? 3600; // Default 1 hour
      const serverBackupLocation = backupLocations[server.appId];

      if (serverInterval > 0 && server.isRunning && serverBackupLocation) {
        const interval = setInterval(() => {
          // eslint-disable-next-line no-console
          console.log(`Auto-backing up ${server.name}...`);
          void (async (): Promise<void> => {
            try {
              // eslint-disable-next-line @typescript-eslint/no-unsafe-call
              const result = (await window.electron.ipcRenderer.invoke(
                "backup-server-save",
                server.appId,
                server.installPath,
                serverBackupLocation
              )) as { success: boolean; backupPath?: string };

              if (result.success && result.backupPath !== undefined) {
                setLastBackups((prev) => ({
                  ...prev,
                  [server.appId]: new Date().toLocaleString(),
                }));
              }
            } catch (err) {
              // eslint-disable-next-line no-console
              console.error(`Auto-backup failed for ${server.name}:`, err);
            }
          })();
        }, serverInterval * 1000); // Convert seconds to milliseconds

        intervals.push(interval);
      }
    });

    return (): void => {
      intervals.forEach((interval) => clearInterval(interval));
    };
  }, [backupIntervals, backupLocations, servers]);

  return (
    <div className="app">
      <TitleBar />
      <div className="container">
        <h1>Steam Server Manager</h1>

        <p>Detected Steam Dedicated Servers</p>

        {error !== null && (
          <div className="error">
            <p>⚠️ {error}</p>
            <button onClick={() => void fetchServers()}>Retry</button>
          </div>
        )}

        {!loading && servers.length === 0 && error !== null && (
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
              {servers.map((server) => (
                <div key={server.appId} className="server-card">
                  {server.coverArt !== undefined && (
                    <div className="server-cover">
                      <img
                        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                        src={server.coverArt}
                        alt={server.name}
                      />
                    </div>
                  )}
                  <div className="server-header">
                    <h3>{server.name}</h3>
                    <span
                      className={`status ${
                        server.isRunning ? "running" : "stopped"
                      }`}
                    >
                      {server.isRunning ? "Running" : "Stopped"}
                    </span>
                  </div>
                  <div className="server-details">
                    <p>
                      <strong>App ID:</strong> {server.appId}
                    </p>
                    <p>
                      <strong>Path:</strong> <code>{server.installPath}</code>
                    </p>
                    <div className="server-actions">
                      {server.isRunning ? (
                        <button
                          className="btn btn-stop"
                          onClick={() =>
                            handleStopServer(server.appId, server.installPath)
                          }
                        >
                          Stop Server
                        </button>
                      ) : (
                        <button
                          className="btn btn-run"
                          onClick={() =>
                            handleRunServer(server.appId, server.installPath)
                          }
                        >
                          Run Server
                        </button>
                      )}
                      <button
                        className="btn btn-edit-config"
                        onClick={() => {
                          setEditingServerAppId(server.appId);
                          setEditingServerInstallPath(server.installPath);
                          setEditingServerName(server.name);
                        }}
                      >
                        ⚙️ Edit Config
                      </button>
                    </div>
                    <div className="server-settings">
                      <label className="auto-restart-checkbox">
                        <input
                          type="checkbox"
                          checked={autoRestartServers.has(server.appId)}
                          onChange={(e) => {
                            setAutoRestartServers((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) {
                                next.add(server.appId);
                              } else {
                                next.delete(server.appId);
                              }
                              return next;
                            });
                          }}
                        />
                        Auto-restart if crashed
                      </label>
                      <label className="auto-restart-checkbox">
                        <input
                          type="checkbox"
                          checked={autoUpdateServers.has(server.appId)}
                          onChange={(e) => {
                            setAutoUpdateServers((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) {
                                next.add(server.appId);
                              } else {
                                next.delete(server.appId);
                              }
                              return next;
                            });
                          }}
                        />
                        Auto-update & restart when available
                      </label>
                      <div className="backup-section">
                        <div className="backup-header">
                          <button
                            className="btn btn-backup-folder"
                            onClick={() =>
                              handleSelectBackupFolder(server.appId)
                            }
                          >
                            📁{" "}
                            {backupLocations[server.appId]
                              ? "Change"
                              : "Select"}{" "}
                            Backup Folder
                          </button>
                          {backupLocations[server.appId] && (
                            <span className="backup-path-display">
                              {backupLocations[server.appId]
                                .split("\\")
                                .pop() ?? backupLocations[server.appId]}
                            </span>
                          )}
                        </div>
                        {backupLocations[server.appId] && (
                          <div className="backup-controls-row">
                            <label htmlFor={`backup-interval-${server.appId}`}>
                              Interval:
                              <select
                                id={`backup-interval-${server.appId}`}
                                value={backupIntervals[server.appId] ?? 3600}
                                onChange={(e) =>
                                  setBackupIntervals((prev) => ({
                                    ...prev,
                                    [server.appId]: Number(e.target.value),
                                  }))
                                }
                                className="backup-interval-select"
                              >
                                <option value={60}>1 minute</option>
                                <option value={300}>5 minutes</option>
                                <option value={1800}>30 minutes</option>
                                <option value={3600}>1 hour</option>
                                <option value={14400}>4 hours</option>
                                <option value={86400}>24 hours</option>
                                <option value={0}>Disabled</option>
                              </select>
                            </label>
                            <button
                              className="btn btn-backup"
                              onClick={() =>
                                handleBackupServer(
                                  server.appId,
                                  server.installPath
                                )
                              }
                            >
                              Backup Now
                            </button>
                            {lastBackups[server.appId] && (
                              <span className="last-backup">
                                Last: {lastBackups[server.appId]}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {editingServerAppId !== null && editingServerInstallPath !== null && editingServerInstallPath !== "" && editingServerName !== null && (
              <ConfigEditor
                appId={editingServerAppId}
                serverName={editingServerName}
                installPath={editingServerInstallPath}
                onClose={() => {
                  setEditingServerAppId(null);
                  setEditingServerInstallPath(null);
                  setEditingServerName(null);
                }}
                onSave={() => {
                  void fetchServers(selectedPath);
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
