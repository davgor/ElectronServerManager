import { useCallback, useEffect, useRef, useState } from "react";

import type { SteamServer } from "../../types/ipc";

interface UseSteamServersOptions {
  /** appIds with auto-restart enabled. Read via ref; changing it must not restart polling. */
  autoRestartAppIds?: ReadonlySet<number>;
  /** appIds with auto-update enabled. Read via ref; changing it must not restart polling. */
  autoUpdateAppIds?: ReadonlySet<number>;
  /** Preferred library path (e.g. persisted); adopted when present in availablePaths. */
  preferredPath?: string;
  serverPollIntervalMs?: number;
  pathPollIntervalMs?: number;
}

interface UseSteamServersResult {
  servers: SteamServer[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  availablePaths: string[];
  selectedPath: string;
  setSelectedPath: (path: string) => void;
}

const DEFAULT_SERVER_POLL_INTERVAL_MS = 10000;
const DEFAULT_PATH_POLL_INTERVAL_MS = 30000;
const AUTO_UPDATE_COOLDOWN_MS = 5 * 60 * 1000;

const EMPTY_APP_IDS: ReadonlySet<number> = new Set<number>();

function serverListsEqual(a: SteamServer[], b: SteamServer[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  return a.every((server, index) => {
    const other = b[index];
    return (
      server.appId === other.appId &&
      server.name === other.name &&
      server.installPath === other.installPath &&
      server.isRunning === other.isRunning
    );
  });
}

function pathListsEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((path, index) => path === b[index]);
}

export function useSteamServers(
  options?: UseSteamServersOptions
): UseSteamServersResult {
  const serverPollIntervalMs =
    options?.serverPollIntervalMs ?? DEFAULT_SERVER_POLL_INTERVAL_MS;
  const pathPollIntervalMs =
    options?.pathPollIntervalMs ?? DEFAULT_PATH_POLL_INTERVAL_MS;
  const autoRestartAppIds = options?.autoRestartAppIds ?? EMPTY_APP_IDS;
  const autoUpdateAppIds = options?.autoUpdateAppIds ?? EMPTY_APP_IDS;
  const preferredPath = options?.preferredPath;

  const [servers, setServers] = useState<SteamServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [availablePaths, setAvailablePaths] = useState<string[]>([]);
  const [selectedPath, setSelectedPathState] = useState("");

  const mountedRef = useRef(true);
  // Previous fetch snapshot for crash detection; updated synchronously per
  // fetch so overlapping/subsequent polls never compare against stale data.
  const prevServersRef = useRef<SteamServer[]>([]);
  // Cooldown bookkeeping lives in a ref (not state) so it never churns
  // callback identities or effect dependencies.
  const lastAutoUpdateTimeRef = useRef<Record<number, number>>({});
  const autoRestartAppIdsRef = useRef(autoRestartAppIds);
  const autoUpdateAppIdsRef = useRef(autoUpdateAppIds);
  const preferredPathRef = useRef(preferredPath);
  const selectedPathRef = useRef("");
  const userSelectedPathRef = useRef(false);

  useEffect(() => {
    autoRestartAppIdsRef.current = autoRestartAppIds;
    autoUpdateAppIdsRef.current = autoUpdateAppIds;
    preferredPathRef.current = preferredPath;
  }, [autoRestartAppIds, autoUpdateAppIds, preferredPath]);

  useEffect(() => {
    mountedRef.current = true;
    return (): void => {
      mountedRef.current = false;
    };
  }, []);

  const fetchServersForPath = useCallback(
    async (path: string, showLoading: boolean): Promise<void> => {
      if (showLoading) {
        setLoading(true);
        setError(null);
      }

      try {
        const result = await window.electron.getSteamServers(path);
        if (!mountedRef.current) {
          return;
        }

        if (result.success) {
          const previousServers = prevServersRef.current;

          result.servers.forEach((newServer) => {
            const previousServer = previousServers.find(
              (s) => s.appId === newServer.appId
            );

            // Crash detection: was running last fetch, stopped now.
            if (
              previousServer !== undefined &&
              previousServer.isRunning &&
              !newServer.isRunning &&
              autoRestartAppIdsRef.current.has(newServer.appId)
            ) {
              console.warn(
                `Server ${newServer.name} crashed, auto-restarting...`
              );
              void (async (): Promise<void> => {
                try {
                  const restartResult = await window.electron.runServer(
                    newServer.appId,
                    newServer.installPath
                  );
                  if (!restartResult.success && mountedRef.current) {
                    setError(
                      `Failed to auto-restart ${newServer.name}: ${restartResult.error ?? "Unknown error"}`
                    );
                  }
                } catch (err) {
                  if (mountedRef.current) {
                    setError(
                      `Failed to auto-restart ${newServer.name}: ${err instanceof Error ? err.message : "Unknown error"}`
                    );
                  }
                }
              })();
            }

            if (
              autoUpdateAppIdsRef.current.has(newServer.appId) &&
              newServer.isRunning
            ) {
              const now = Date.now();
              const lastUpdateTime =
                lastAutoUpdateTimeRef.current[newServer.appId] ?? 0;

              if (now - lastUpdateTime > AUTO_UPDATE_COOLDOWN_MS) {
                lastAutoUpdateTimeRef.current[newServer.appId] = now;
                console.warn(
                  `Checking for updates for ${newServer.name} (auto-update enabled)...`
                );
                void (async (): Promise<void> => {
                  try {
                    const updateResult = await window.electron.autoUpdateServer(
                      newServer.appId,
                      newServer.installPath,
                      path
                    );
                    if (!updateResult.success && mountedRef.current) {
                      setError(
                        `Failed to auto-update ${newServer.name}: ${updateResult.error ?? "Unknown error"}`
                      );
                    }
                  } catch (err) {
                    if (mountedRef.current) {
                      setError(
                        `Failed to auto-update ${newServer.name}: ${err instanceof Error ? err.message : "Unknown error"}`
                      );
                    }
                  }
                })();
              }
            }
          });

          const hasChanges = !serverListsEqual(previousServers, result.servers);
          prevServersRef.current = result.servers;

          if (hasChanges) {
            setServers(result.servers);
          }
          setError(null);
        } else {
          setError(result.error ?? "Failed to detect Steam servers");
        }
      } catch (err) {
        if (!mountedRef.current) {
          return;
        }
        setError(
          err instanceof Error ? err.message : "An unexpected error occurred"
        );
      } finally {
        if (mountedRef.current && showLoading) {
          setLoading(false);
        }
      }
    },
    []
  );

  const fetchAvailablePaths = useCallback(async (): Promise<void> => {
    try {
      const paths = await window.electron.getSteamPaths();
      if (!mountedRef.current) {
        return;
      }

      setAvailablePaths((prev) => (pathListsEqual(prev, paths) ? prev : paths));

      if (paths.length > 0 && selectedPathRef.current === "") {
        const preferred = preferredPathRef.current;
        const nextPath =
          preferred !== undefined &&
          preferred !== "" &&
          paths.includes(preferred)
            ? preferred
            : paths[0];
        selectedPathRef.current = nextPath;
        setSelectedPathState(nextPath);
      }
    } catch (err) {
      console.error("Failed to fetch Steam paths:", err);
    }
  }, []);

  // Adopt a preferredPath that arrives after initial auto-selection (settings
  // load asynchronously), as long as the user has not chosen a path manually.
  useEffect(() => {
    if (
      preferredPath !== undefined &&
      preferredPath !== "" &&
      !userSelectedPathRef.current &&
      availablePaths.includes(preferredPath) &&
      selectedPathRef.current !== preferredPath
    ) {
      selectedPathRef.current = preferredPath;
      setSelectedPathState(preferredPath);
    }
  }, [preferredPath, availablePaths]);

  // Fetch available Steam paths on mount and poll for new installations.
  useEffect(() => {
    void fetchAvailablePaths();

    const pathsInterval = setInterval(() => {
      void fetchAvailablePaths();
    }, pathPollIntervalMs);

    return (): void => {
      clearInterval(pathsInterval);
    };
  }, [fetchAvailablePaths, pathPollIntervalMs]);

  // Fetch servers immediately when the selected path changes, then poll.
  // Background polls do not toggle `loading`.
  useEffect(() => {
    if (selectedPath === "") {
      return;
    }

    void fetchServersForPath(selectedPath, true);

    const serversInterval = setInterval(() => {
      void fetchServersForPath(selectedPath, false);
    }, serverPollIntervalMs);

    return (): void => {
      clearInterval(serversInterval);
    };
  }, [selectedPath, fetchServersForPath, serverPollIntervalMs]);

  const refresh = useCallback(async (): Promise<void> => {
    const path = selectedPathRef.current;
    if (path === "") {
      return;
    }
    await fetchServersForPath(path, true);
  }, [fetchServersForPath]);

  const setSelectedPath = useCallback((path: string): void => {
    userSelectedPathRef.current = true;
    selectedPathRef.current = path;
    setSelectedPathState(path);
  }, []);

  return {
    servers,
    loading,
    error,
    refresh,
    availablePaths,
    selectedPath,
    setSelectedPath,
  };
}
