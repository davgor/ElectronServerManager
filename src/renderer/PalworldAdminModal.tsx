import { useCallback, useState } from "react";

import type { PalworldRestEndpoint, SteamServer } from "../types/ipc";

import "./PalworldAdminModal.css";

export interface PalworldAdminModalProps {
  server: SteamServer;
  onClose: () => void;
}

interface ActionState {
  busy: boolean;
  message: string | null;
  error: string | null;
  data: unknown;
}

const INITIAL_STATE: ActionState = {
  busy: false,
  message: null,
  error: null,
  data: null,
};

export function PalworldAdminModal({
  server,
  onClose,
}: PalworldAdminModalProps): JSX.Element {
  const [state, setState] = useState<ActionState>(INITIAL_STATE);
  const [announceMessage, setAnnounceMessage] = useState("");
  const [playerUserId, setPlayerUserId] = useState("");
  const [playerMessage, setPlayerMessage] = useState("");
  const [shutdownWait, setShutdownWait] = useState(60);
  const [shutdownMessage, setShutdownMessage] = useState(
    "Server shutting down"
  );

  const runRequest = useCallback(
    async (
      method: "GET" | "POST",
      endpoint: PalworldRestEndpoint,
      body?: Record<string, unknown>
    ): Promise<void> => {
      setState({ busy: true, message: null, error: null, data: null });
      try {
        const result = await window.electron.palworldRestRequest(
          server.appId,
          server.installPath,
          method,
          endpoint,
          body
        );
        if (!result.success) {
          setState({
            busy: false,
            message: null,
            error: result.error ?? "Request failed",
            data: null,
          });
          return;
        }
        setState({
          busy: false,
          message: `${method} ${endpoint} succeeded`,
          error: null,
          data: result.data ?? {},
        });
      } catch (error) {
        setState({
          busy: false,
          message: null,
          error: error instanceof Error ? error.message : String(error),
          data: null,
        });
      }
    },
    [server.appId, server.installPath]
  );

  function confirmDestructive(label: string): boolean {
    return window.confirm(`Confirm ${label}? This cannot be undone easily.`);
  }

  return (
    <div
      className="palworld-admin-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="palworld-admin-title"
    >
      <div className="palworld-admin-modal">
        <div className="palworld-admin-header">
          <div>
            <h2 id="palworld-admin-title">Palworld REST Admin</h2>
            <p className="palworld-admin-subtitle">{server.name}</p>
          </div>
          <button
            type="button"
            className="close-btn"
            onClick={onClose}
            aria-label="Close admin modal"
          >
            ×
          </button>
        </div>

        <div className="palworld-admin-body">
          <section className="palworld-admin-section">
            <h3>Read</h3>
            <div className="palworld-admin-actions">
              {(
                ["info", "players", "settings", "metrics", "game-data"] as const
              ).map((endpoint) => (
                <button
                  key={endpoint}
                  type="button"
                  className="btn btn-palworld-admin"
                  disabled={state.busy}
                  onClick={() => {
                    void runRequest("GET", endpoint);
                  }}
                >
                  GET {endpoint}
                </button>
              ))}
            </div>
          </section>

          <section className="palworld-admin-section">
            <h3>Announce</h3>
            <div className="palworld-admin-form-row">
              <input
                type="text"
                value={announceMessage}
                onChange={(e) => setAnnounceMessage(e.target.value)}
                placeholder="Announcement message"
                aria-label="Announcement message"
              />
              <button
                type="button"
                className="btn btn-palworld-admin"
                disabled={state.busy || announceMessage.trim() === ""}
                onClick={() => {
                  void runRequest("POST", "announce", {
                    message: announceMessage,
                  });
                }}
              >
                Announce
              </button>
            </div>
          </section>

          <section className="palworld-admin-section">
            <h3>Player actions</h3>
            <div className="palworld-admin-form-row">
              <input
                type="text"
                value={playerUserId}
                onChange={(e) => setPlayerUserId(e.target.value)}
                placeholder="userid"
                aria-label="Player userid"
              />
              <input
                type="text"
                value={playerMessage}
                onChange={(e) => setPlayerMessage(e.target.value)}
                placeholder="message / reason"
                aria-label="Player action message"
              />
            </div>
            <div className="palworld-admin-actions">
              <button
                type="button"
                className="btn btn-palworld-admin"
                disabled={state.busy || playerUserId.trim() === ""}
                onClick={() => {
                  void runRequest("POST", "kick", {
                    userid: playerUserId,
                    message: playerMessage,
                  });
                }}
              >
                Kick
              </button>
              <button
                type="button"
                className="btn btn-palworld-admin btn-destructive"
                disabled={state.busy || playerUserId.trim() === ""}
                onClick={() => {
                  if (!confirmDestructive("ban player")) {
                    return;
                  }
                  void runRequest("POST", "ban", {
                    userid: playerUserId,
                    message: playerMessage,
                  });
                }}
              >
                Ban
              </button>
              <button
                type="button"
                className="btn btn-palworld-admin"
                disabled={state.busy || playerUserId.trim() === ""}
                onClick={() => {
                  void runRequest("POST", "unban", { userid: playerUserId });
                }}
              >
                Unban
              </button>
            </div>
          </section>

          <section className="palworld-admin-section">
            <h3>Server control</h3>
            <div className="palworld-admin-actions">
              <button
                type="button"
                className="btn btn-palworld-admin"
                disabled={state.busy}
                onClick={() => {
                  void runRequest("POST", "save");
                }}
              >
                Save world
              </button>
            </div>
            <div className="palworld-admin-form-row">
              <label htmlFor="shutdown-wait">
                Wait (s)
                <input
                  id="shutdown-wait"
                  type="number"
                  min={0}
                  value={shutdownWait}
                  onChange={(e) => setShutdownWait(Number(e.target.value))}
                />
              </label>
              <input
                type="text"
                value={shutdownMessage}
                onChange={(e) => setShutdownMessage(e.target.value)}
                placeholder="Shutdown message"
                aria-label="Shutdown message"
              />
              <button
                type="button"
                className="btn btn-palworld-admin btn-destructive"
                disabled={state.busy}
                onClick={() => {
                  if (!confirmDestructive("graceful shutdown")) {
                    return;
                  }
                  void runRequest("POST", "shutdown", {
                    waittime: shutdownWait,
                    message: shutdownMessage,
                  });
                }}
              >
                Shutdown
              </button>
              <button
                type="button"
                className="btn btn-palworld-admin btn-destructive"
                disabled={state.busy}
                onClick={() => {
                  if (!confirmDestructive("force stop")) {
                    return;
                  }
                  void runRequest("POST", "stop");
                }}
              >
                Force stop
              </button>
            </div>
          </section>

          <section className="palworld-admin-section">
            <h3>Result</h3>
            {state.busy && <p className="palworld-admin-status">Working…</p>}
            {state.message !== null && (
              <p className="palworld-admin-success">{state.message}</p>
            )}
            {state.error !== null && (
              <p className="palworld-admin-error">{state.error}</p>
            )}
            {state.data !== null && (
              <pre
                className="palworld-admin-result"
                data-testid="palworld-admin-result"
              >
                {JSON.stringify(state.data, null, 2)}
              </pre>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
