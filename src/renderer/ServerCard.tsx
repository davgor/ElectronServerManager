import { useEffect, useState } from "react";

import type { SteamServer } from "../types/ipc";
import { PALWORLD_APP_ID } from "../types/ipc";

import { PalworldAdminModal } from "./PalworldAdminModal";
import { PalworldOpsPanel } from "./PalworldOpsPanel";
import { resolvePalworldOpsIntervalSeconds } from "./palworldOpsSettings";

export interface ServerCardProps {
  server: SteamServer;
  autoRestartEnabled: boolean;
  autoUpdateEnabled: boolean;
  backupPath: string | undefined;
  backupIntervalSeconds: number;
  lastBackup: string | undefined;
  palworldOpsEnabled: boolean;
  palworldOpsIntervalSeconds: number | undefined;
  configRevision: number;
  onRunServer: (appId: number, installPath: string) => void;
  onStopServer: (appId: number, installPath: string) => void;
  onToggleAutoRestart: (appId: number, enabled: boolean) => void;
  onToggleAutoUpdate: (appId: number, enabled: boolean) => void;
  onSelectBackupFolder: (appId: number) => void;
  onChangeBackupInterval: (appId: number, seconds: number) => void;
  onBackupNow: (appId: number, installPath: string) => void;
  onEditConfig: (server: SteamServer) => void;
  onTogglePalworldOps: (appId: number, enabled: boolean) => void;
  onChangePalworldOpsInterval: (appId: number, seconds: number) => void;
}

const REST_DISABLED_TOOLTIP =
  "Please enable REST API from the config settings.";

export function ServerCard({
  server,
  autoRestartEnabled,
  autoUpdateEnabled,
  backupPath,
  backupIntervalSeconds,
  lastBackup,
  palworldOpsEnabled,
  palworldOpsIntervalSeconds,
  configRevision,
  onRunServer,
  onStopServer,
  onToggleAutoRestart,
  onToggleAutoUpdate,
  onSelectBackupFolder,
  onChangeBackupInterval,
  onBackupNow,
  onEditConfig,
  onTogglePalworldOps,
  onChangePalworldOpsInterval,
}: ServerCardProps): JSX.Element {
  const hasBackupPath = backupPath !== undefined && backupPath !== "";
  const hasLastBackup = lastBackup !== undefined && lastBackup !== "";
  const isPalworld = server.appId === PALWORLD_APP_ID;
  const [showOutput, setShowOutput] = useState(false);
  const [serverOutput, setServerOutput] = useState("");
  const [restEnabled, setRestEnabled] = useState(false);
  const [showAdminModal, setShowAdminModal] = useState(false);

  useEffect(() => {
    if (!isPalworld) {
      setRestEnabled(false);
      return;
    }

    let cancelled = false;
    void window.electron
      .getPalworldRestStatus(server.appId, server.installPath)
      .then((status) => {
        if (!cancelled) {
          setRestEnabled(status.success && status.enabled);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRestEnabled(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isPalworld, server.appId, server.installPath, configRevision]);

  async function toggleServerOutput(): Promise<void> {
    if (showOutput) {
      setShowOutput(false);
      return;
    }
    const output = await window.electron.getServerOutput(server.appId);
    setServerOutput(output);
    setShowOutput(true);
  }

  return (
    <div className="server-card">
      {server.coverArt !== undefined && (
        <div className="server-cover">
          <img src={server.coverArt} alt={server.name} />
        </div>
      )}
      <div className="server-header">
        <h3>{server.name}</h3>
        <span className={`status ${server.isRunning ? "running" : "stopped"}`}>
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
              onClick={() => onStopServer(server.appId, server.installPath)}
            >
              Stop Server
            </button>
          ) : (
            <button
              className="btn btn-run"
              onClick={() => onRunServer(server.appId, server.installPath)}
            >
              Run Server
            </button>
          )}
          <button
            className="btn btn-edit-config"
            onClick={() => onEditConfig(server)}
          >
            ⚙️ Edit Config
          </button>
          {isPalworld && (
            <span
              className="palworld-admin-btn-wrap"
              title={restEnabled ? undefined : REST_DISABLED_TOOLTIP}
            >
              <button
                type="button"
                className="btn btn-palworld-admin-open"
                disabled={!restEnabled}
                title={
                  restEnabled
                    ? "Open Palworld REST admin"
                    : REST_DISABLED_TOOLTIP
                }
                onClick={() => setShowAdminModal(true)}
              >
                Admin
              </button>
            </span>
          )}
          <button
            className="btn btn-server-output"
            onClick={() => {
              void toggleServerOutput();
            }}
          >
            {showOutput ? "Hide Output" : "Show Output"}
          </button>
        </div>
        {showOutput && (
          <pre className="server-output" data-testid="server-output">
            {serverOutput.length > 0
              ? serverOutput
              : "(no recent output captured)"}
          </pre>
        )}
        {isPalworld && (
          <PalworldOpsPanel
            server={server}
            restEnabled={restEnabled}
            opsEnabled={palworldOpsEnabled}
            opsIntervalSeconds={resolvePalworldOpsIntervalSeconds(
              palworldOpsIntervalSeconds
            )}
            onToggleOps={(enabled) =>
              onTogglePalworldOps(server.appId, enabled)
            }
            onChangeInterval={(seconds) =>
              onChangePalworldOpsInterval(server.appId, seconds)
            }
          />
        )}
        <div className="server-settings">
          <label className="auto-restart-checkbox">
            <input
              type="checkbox"
              checked={autoRestartEnabled}
              onChange={(e) =>
                onToggleAutoRestart(server.appId, e.target.checked)
              }
            />
            Auto-restart if crashed
          </label>
          <label className="auto-restart-checkbox">
            <input
              type="checkbox"
              checked={autoUpdateEnabled}
              onChange={(e) =>
                onToggleAutoUpdate(server.appId, e.target.checked)
              }
            />
            Auto-update & restart when available
          </label>
          <div className="backup-section">
            <div className="backup-header">
              <button
                className="btn btn-backup-folder"
                onClick={() => onSelectBackupFolder(server.appId)}
              >
                📁 {hasBackupPath ? "Change" : "Select"} Backup Folder
              </button>
              {hasBackupPath && (
                <span className="backup-path-display">
                  {backupPath.split("\\").pop() ?? backupPath}
                </span>
              )}
            </div>
            {hasBackupPath && (
              <div className="backup-controls-row">
                <label htmlFor={`backup-interval-${server.appId}`}>
                  Interval:
                  <select
                    id={`backup-interval-${server.appId}`}
                    value={backupIntervalSeconds}
                    onChange={(e) =>
                      onChangeBackupInterval(
                        server.appId,
                        Number(e.target.value)
                      )
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
                  onClick={() => onBackupNow(server.appId, server.installPath)}
                >
                  Backup Now
                </button>
                {hasLastBackup && (
                  <span className="last-backup">Last: {lastBackup}</span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      {showAdminModal && (
        <PalworldAdminModal
          server={server}
          onClose={() => setShowAdminModal(false)}
        />
      )}
    </div>
  );
}
