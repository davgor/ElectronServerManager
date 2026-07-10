import type { SteamServer } from "../types/ipc";

export interface ServerCardProps {
  server: SteamServer;
  autoRestartEnabled: boolean;
  autoUpdateEnabled: boolean;
  backupPath: string | undefined;
  backupIntervalSeconds: number;
  lastBackup: string | undefined;
  onRunServer: (appId: number, installPath: string) => void;
  onStopServer: (appId: number, installPath: string) => void;
  onToggleAutoRestart: (appId: number, enabled: boolean) => void;
  onToggleAutoUpdate: (appId: number, enabled: boolean) => void;
  onSelectBackupFolder: (appId: number) => void;
  onChangeBackupInterval: (appId: number, seconds: number) => void;
  onBackupNow: (appId: number, installPath: string) => void;
  onEditConfig: (server: SteamServer) => void;
}

export function ServerCard({
  server,
  autoRestartEnabled,
  autoUpdateEnabled,
  backupPath,
  backupIntervalSeconds,
  lastBackup,
  onRunServer,
  onStopServer,
  onToggleAutoRestart,
  onToggleAutoUpdate,
  onSelectBackupFolder,
  onChangeBackupInterval,
  onBackupNow,
  onEditConfig,
}: ServerCardProps): JSX.Element {
  const hasBackupPath = backupPath !== undefined && backupPath !== "";
  const hasLastBackup = lastBackup !== undefined && lastBackup !== "";

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
        </div>
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
    </div>
  );
}
