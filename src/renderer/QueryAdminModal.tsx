import { useEffect, useState } from "react";

import type { GameQuerySnapshotResponse, SteamServer } from "../types/ipc";

import {
  describeQueryError,
  formatPlayerCount,
  formatPlayerDuration,
  playerDisplayName,
  playerRowKeys,
  REPORTED_VERSION_HINT,
} from "./queryOpsFormat";

// Shared admin dialog look (class names are historical, not game-specific).
import "./PalworldAdminModal.css";
import "./QueryAdminModal.css";

interface QueryAdminModalProps {
  server: SteamServer;
  onClose: () => void;
  onStopServer: () => void;
  /** Opens the config editor on the admin roles key; omitted when unknown. */
  onEditRoles: (() => void) | undefined;
}

interface QueryState {
  busy: boolean;
  snapshot: GameQuerySnapshotResponse | null;
  error: string | null;
}

const NOT_AVAILABLE = "—";

function Fact({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="query-admin-fact">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function PlayerList({
  snapshot,
}: {
  snapshot: GameQuerySnapshotResponse;
}): JSX.Element | null {
  const players = snapshot.players;
  if (players === undefined || players === null) {
    const playersError = snapshot.playersError;
    if (playersError === undefined || playersError === "") {
      return null;
    }
    return (
      <p className="palworld-admin-error">
        Player list unavailable: {playersError}
      </p>
    );
  }
  if (players.length === 0) {
    return <p className="query-admin-note">No players online</p>;
  }
  const keys = playerRowKeys(players);
  return (
    <ul className="query-admin-players" aria-label="Players online">
      {players.map((player, position) => (
        <li key={keys[position]}>
          <span>{playerDisplayName(player)}</span>
          <span className="query-admin-player-time">
            {formatPlayerDuration(player.durationSeconds)}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Admin surface for games without a remote admin API (epic 042). It shows
 * what the server query can report, states plainly which moderation and
 * world commands cannot be sent remotely, and offers the process stop.
 */
export function QueryAdminModal({
  server,
  onClose,
  onStopServer,
  onEditRoles,
}: QueryAdminModalProps): JSX.Element {
  const [state, setState] = useState<QueryState>({
    busy: server.isRunning,
    snapshot: null,
    error: null,
  });
  const [refreshCount, setRefreshCount] = useState(0);

  useEffect(() => {
    // A stopped server cannot answer; skip the query (and its timeout).
    if (!server.isRunning) {
      setState({ busy: false, snapshot: null, error: null });
      return;
    }

    let cancelled = false;
    setState((previous) => ({ ...previous, busy: true }));

    window.electron
      .getGameQuerySnapshot(server.appId, server.installPath)
      .then((snapshot) => {
        if (cancelled) {
          return;
        }
        setState({
          busy: false,
          snapshot,
          error: snapshot.success ? null : describeQueryError(snapshot),
        });
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        setState({
          busy: false,
          snapshot: null,
          error: error instanceof Error ? error.message : String(error),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [server.appId, server.installPath, server.isRunning, refreshCount]);

  const unsupportedTitle = `Not supported remotely by ${server.name}`;
  const { busy, snapshot, error } = state;
  const info = snapshot?.info;
  const address =
    snapshot?.host !== undefined && snapshot.port !== undefined
      ? `${snapshot.host}:${snapshot.port}`
      : null;

  function handleStop(): void {
    const confirmed = window.confirm(
      `Stop ${server.name}? Players online will be disconnected and unsaved progress since the last autosave can be lost.`
    );
    if (!confirmed) {
      return;
    }
    onStopServer();
    onClose();
  }

  return (
    <div
      className="palworld-admin-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="query-admin-title"
    >
      <div className="palworld-admin-modal">
        <div className="palworld-admin-header">
          <div>
            <h2 id="query-admin-title">Server Admin</h2>
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
            <h3>Live status</h3>
            <div className="palworld-admin-actions">
              <button
                type="button"
                className="btn btn-palworld-admin"
                disabled={busy || !server.isRunning}
                onClick={() => setRefreshCount((count) => count + 1)}
              >
                Refresh
              </button>
            </div>
            {!server.isRunning && (
              <p className="query-admin-note">
                Server is not running. Start it to see live status.
              </p>
            )}
            {busy && <p className="palworld-admin-status">Querying server…</p>}
            {error !== null && <p className="palworld-admin-error">{error}</p>}
            {(address !== null || info !== undefined) && (
              <dl className="query-admin-facts">
                {address !== null && <Fact label="Address" value={address} />}
                {info !== undefined && (
                  <>
                    <Fact label="Server name" value={info.serverName} />
                    <div className="query-admin-fact">
                      <dt title={REPORTED_VERSION_HINT}>
                        Server-reported version
                      </dt>
                      <dd>
                        {info.version !== "" ? info.version : NOT_AVAILABLE}
                      </dd>
                    </div>
                    <Fact label="Players" value={formatPlayerCount(info)} />
                    <Fact
                      label="Password protected"
                      value={info.passwordProtected ? "Yes" : "No"}
                    />
                  </>
                )}
              </dl>
            )}
            {snapshot?.success === true && (
              <>
                <h4 className="query-admin-players-title">Players online</h4>
                <PlayerList snapshot={snapshot} />
              </>
            )}
          </section>

          <section className="palworld-admin-section">
            <h3>Player moderation</h3>
            <p className="query-admin-note">
              {server.name} has no remote admin API, so kick, ban and unban
              can&apos;t be sent from here. Join the server with an admin role
              password and use the in-game player list.
            </p>
            <div className="palworld-admin-actions">
              {(["Kick", "Ban", "Unban"] as const).map((label) => (
                <button
                  key={label}
                  type="button"
                  className="btn btn-palworld-admin"
                  disabled
                  title={unsupportedTitle}
                >
                  {label}
                </button>
              ))}
              {onEditRoles !== undefined && (
                <button
                  type="button"
                  className="btn btn-palworld-admin"
                  onClick={onEditRoles}
                >
                  Edit admin roles in config
                </button>
              )}
            </div>
          </section>

          <section className="palworld-admin-section">
            <h3>Broadcast &amp; world</h3>
            <p className="query-admin-note">
              There is no remote announce or save command. The server autosaves
              the world on its own schedule. Stop ends the process immediately,
              so progress since the last autosave can be lost.
            </p>
            <div className="palworld-admin-actions">
              {(["Announce", "Save world"] as const).map((label) => (
                <button
                  key={label}
                  type="button"
                  className="btn btn-palworld-admin"
                  disabled
                  title={unsupportedTitle}
                >
                  {label}
                </button>
              ))}
            </div>
          </section>

          <section className="palworld-admin-section">
            <h3>Server control</h3>
            <div className="palworld-admin-actions">
              <button
                type="button"
                className="btn btn-palworld-admin btn-destructive"
                disabled={!server.isRunning}
                onClick={handleStop}
              >
                Stop server
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
