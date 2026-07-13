import { useEffect, useState } from "react";

import type { SteamServer } from "../types/ipc";

import {
  resolvePalworldOpsIntervalSeconds,
  shouldPollPalworldOps,
} from "./palworldOpsSettings";

import "./PalworldOpsPanel.css";

interface PalworldOpsPanelProps {
  server: SteamServer;
  restEnabled: boolean;
  opsEnabled: boolean;
  opsIntervalSeconds: number;
  onToggleOps: (enabled: boolean) => void;
  onChangeInterval: (seconds: number) => void;
}

interface OpsSnapshot {
  info: unknown;
  players: unknown;
  metrics: unknown;
  error: string | null;
  updatedAt: string | null;
}

function readMetricNumber(
  metrics: unknown,
  keys: string[]
): number | string | null {
  if (metrics === null || typeof metrics !== "object") {
    return null;
  }
  const record = metrics as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" || typeof value === "string") {
      return value;
    }
  }
  return null;
}

function playerNames(players: unknown): string[] {
  if (players === null || typeof players !== "object") {
    return [];
  }
  const record = players as Record<string, unknown>;
  const list = record.players ?? record.Players;
  if (!Array.isArray(list)) {
    return [];
  }
  return list
    .map((entry) => {
      if (entry === null || typeof entry !== "object") {
        return null;
      }
      const row = entry as Record<string, unknown>;
      const name = row.name ?? row.Name ?? row.nickName ?? row.NickName;
      return typeof name === "string" ? name : null;
    })
    .filter((name): name is string => name !== null);
}

export function PalworldOpsPanel({
  server,
  restEnabled,
  opsEnabled,
  opsIntervalSeconds,
  onToggleOps,
  onChangeInterval,
}: PalworldOpsPanelProps): JSX.Element {
  const interval = resolvePalworldOpsIntervalSeconds(opsIntervalSeconds);
  const [snapshot, setSnapshot] = useState<OpsSnapshot>({
    info: null,
    players: null,
    metrics: null,
    error: null,
    updatedAt: null,
  });

  const canPoll = shouldPollPalworldOps({
    isPalworld: true,
    isRunning: server.isRunning,
    restEnabled,
    opsEnabled,
  });

  useEffect(() => {
    if (!canPoll) {
      return;
    }

    let cancelled = false;

    async function pollOnce(): Promise<void> {
      try {
        const [info, players, metrics] = await Promise.all([
          window.electron.palworldRestRequest(
            server.appId,
            server.installPath,
            "GET",
            "info"
          ),
          window.electron.palworldRestRequest(
            server.appId,
            server.installPath,
            "GET",
            "players"
          ),
          window.electron.palworldRestRequest(
            server.appId,
            server.installPath,
            "GET",
            "metrics"
          ),
        ]);

        if (cancelled) {
          return;
        }

        const firstError =
          (!info.success ? info.error : undefined) ??
          (!players.success ? players.error : undefined) ??
          (!metrics.success ? metrics.error : undefined) ??
          null;

        setSnapshot({
          info: info.data ?? null,
          players: players.data ?? null,
          metrics: metrics.data ?? null,
          error: firstError,
          updatedAt: new Date().toLocaleTimeString(),
        });
      } catch (error) {
        if (cancelled) {
          return;
        }
        setSnapshot((previous) => ({
          ...previous,
          error: error instanceof Error ? error.message : String(error),
        }));
      }
    }

    void pollOnce();
    const timer = window.setInterval(() => {
      void pollOnce();
    }, interval * 1000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [canPoll, interval, server.appId, server.installPath, server.isRunning]);

  const fps = readMetricNumber(snapshot.metrics, ["fps", "FPS", "serverfps"]);
  const playerCount = readMetricNumber(snapshot.metrics, [
    "currentplayernum",
    "currentPlayerNum",
    "playernum",
    "playerNum",
  ]);
  const uptime = readMetricNumber(snapshot.metrics, [
    "uptime",
    "Uptime",
    "serveruptime",
  ]);
  const names = playerNames(snapshot.players);
  const serverName =
    snapshot.info !== null &&
    typeof snapshot.info === "object" &&
    typeof (snapshot.info as Record<string, unknown>).servername === "string"
      ? String((snapshot.info as Record<string, unknown>).servername)
      : null;

  return (
    <div className="palworld-ops" data-testid="palworld-ops-panel">
      <div className="palworld-ops-controls">
        <label className="auto-restart-checkbox">
          <input
            type="checkbox"
            checked={opsEnabled}
            disabled={!restEnabled}
            onChange={(e) => onToggleOps(e.target.checked)}
          />
          Live ops panel
        </label>
        <label
          className="palworld-ops-interval"
          htmlFor={`palworld-ops-interval-${server.appId}`}
        >
          Poll every
          <select
            id={`palworld-ops-interval-${server.appId}`}
            value={interval}
            disabled={!restEnabled}
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

      {!restEnabled && (
        <p className="palworld-ops-hint">
          Enable REST API in config to use live ops.
        </p>
      )}

      {canPoll && (
        <div className="palworld-ops-terminal" data-testid="palworld-ops-live">
          <div className="palworld-ops-line">
            <span className="palworld-ops-key">status</span>
            <span className="palworld-ops-val">
              polling@{interval}s
              {snapshot.updatedAt !== null ? ` · ${snapshot.updatedAt}` : ""}
            </span>
          </div>
          {serverName !== null && (
            <div className="palworld-ops-line">
              <span className="palworld-ops-key">server</span>
              <span className="palworld-ops-val">{serverName}</span>
            </div>
          )}
          <div className="palworld-ops-line">
            <span className="palworld-ops-key">fps</span>
            <span className="palworld-ops-val">
              {fps !== null ? String(fps) : "—"}
            </span>
          </div>
          <div className="palworld-ops-line">
            <span className="palworld-ops-key">players</span>
            <span className="palworld-ops-val">
              {playerCount !== null ? String(playerCount) : "—"}
              {names.length > 0 ? ` · ${names.join(", ")}` : ""}
            </span>
          </div>
          <div className="palworld-ops-line">
            <span className="palworld-ops-key">uptime</span>
            <span className="palworld-ops-val">
              {uptime !== null ? String(uptime) : "—"}
            </span>
          </div>
          {snapshot.error !== null && (
            <div className="palworld-ops-line palworld-ops-error">
              <span className="palworld-ops-key">error</span>
              <span className="palworld-ops-val">{snapshot.error}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
