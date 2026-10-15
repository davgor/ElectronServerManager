import { useEffect, useState } from "react";

import type { GameQuerySnapshotResponse, SteamServer } from "../types/ipc";

import { resolvePalworldOpsIntervalSeconds } from "./palworldOpsSettings";
import {
  describeQueryError,
  formatPlayerCount,
  REPORTED_VERSION_HINT,
  reportedPlayerNames,
} from "./queryOpsFormat";

// Shared live-ops look (class names are historical, not game-specific).
import "./PalworldOpsPanel.css";

interface QueryOpsPanelProps {
  server: SteamServer;
  opsEnabled: boolean;
  opsIntervalSeconds: number;
  onToggleOps: (enabled: boolean) => void;
  onChangeInterval: (seconds: number) => void;
}

interface QueryOpsState {
  snapshot: GameQuerySnapshotResponse | null;
  updatedAt: string | null;
}

const EMPTY_STATE: QueryOpsState = { snapshot: null, updatedAt: null };

const NOT_AVAILABLE = "—";

/**
 * Live ops panel for games whose only ops surface is a server query (e.g.
 * Enshrouded over Steam A2S, epic 042). The query needs no enable flag, so
 * the controls are always usable; polling runs only while the server is
 * running and the operator has the panel switched on.
 */
export function QueryOpsPanel({
  server,
  opsEnabled,
  opsIntervalSeconds,
  onToggleOps,
  onChangeInterval,
}: QueryOpsPanelProps): JSX.Element {
  const interval = resolvePalworldOpsIntervalSeconds(opsIntervalSeconds);
  const [state, setState] = useState<QueryOpsState>(EMPTY_STATE);
  const canPoll = server.isRunning && opsEnabled;

  useEffect(() => {
    if (!canPoll) {
      setState(EMPTY_STATE);
      return;
    }

    let cancelled = false;
    // A silent server can take several UDP timeouts to fail; skip ticks while
    // a query is still pending instead of stacking sockets.
    let inFlight = false;

    async function pollOnce(): Promise<void> {
      if (inFlight) {
        return;
      }
      inFlight = true;
      let snapshot: GameQuerySnapshotResponse;
      try {
        snapshot = await window.electron.getGameQuerySnapshot(
          server.appId,
          server.installPath
        );
      } catch (error) {
        snapshot = {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      } finally {
        inFlight = false;
      }
      if (cancelled) {
        return;
      }
      setState({ snapshot, updatedAt: new Date().toLocaleTimeString() });
    }

    void pollOnce();
    const timer = window.setInterval(() => {
      void pollOnce();
    }, interval * 1000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [canPoll, interval, server.appId, server.installPath]);

  const { snapshot, updatedAt } = state;
  const info = snapshot?.info;
  const names = reportedPlayerNames(snapshot?.players);
  const playersError = snapshot?.playersError;

  return (
    <div className="palworld-ops" data-testid="query-ops-panel">
      <div className="palworld-ops-controls">
        <label className="auto-restart-checkbox">
          <input
            type="checkbox"
            checked={opsEnabled}
            onChange={(e) => onToggleOps(e.target.checked)}
          />
          Live ops panel
        </label>
        <label
          className="palworld-ops-interval"
          htmlFor={`query-ops-interval-${server.appId}`}
        >
          Poll every
          <select
            id={`query-ops-interval-${server.appId}`}
            value={interval}
            onChange={(e) => onChangeInterval(Number(e.target.value))}
          >
            <option value={2}>2s</option>
            <option value={5}>5s</option>
            <option value={10}>10s</option>
            <option value={15}>15s</option>
            <option value={30}>30s</option>
            <option value={60}>60s</option>
          </select>
        </label>
      </div>

      {opsEnabled && !server.isRunning && (
        <p className="palworld-ops-hint">
          Start the server to see live status.
        </p>
      )}

      {canPoll && (
        <div className="palworld-ops-terminal" data-testid="query-ops-live">
          <div className="palworld-ops-line">
            <span className="palworld-ops-key">status</span>
            <span className="palworld-ops-val">
              polling@{interval}s{updatedAt !== null ? ` · ${updatedAt}` : ""}
            </span>
          </div>
          <div className="palworld-ops-line">
            <span className="palworld-ops-key">server</span>
            <span className="palworld-ops-val">
              {info !== undefined ? info.serverName : NOT_AVAILABLE}
            </span>
          </div>
          <div className="palworld-ops-line">
            <span className="palworld-ops-key" title={REPORTED_VERSION_HINT}>
              reported version
            </span>
            <span className="palworld-ops-val">
              {info !== undefined && info.version !== ""
                ? info.version
                : NOT_AVAILABLE}
            </span>
          </div>
          <div className="palworld-ops-line">
            <span className="palworld-ops-key">players</span>
            <span className="palworld-ops-val">
              {info !== undefined ? formatPlayerCount(info) : NOT_AVAILABLE}
              {names.length > 0 ? ` · ${names.join(", ")}` : ""}
            </span>
          </div>
          {snapshot !== null && !snapshot.success && (
            <div className="palworld-ops-line palworld-ops-error">
              <span className="palworld-ops-key">error</span>
              <span className="palworld-ops-val">
                {describeQueryError(snapshot)}
              </span>
            </div>
          )}
          {playersError !== undefined && playersError !== "" && (
            <div className="palworld-ops-line palworld-ops-error">
              <span className="palworld-ops-key">player list</span>
              <span className="palworld-ops-val">{playersError}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
