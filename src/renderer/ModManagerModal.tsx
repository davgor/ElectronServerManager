import { useCallback, useEffect, useState } from "react";

import type { ServerModSummary, SteamServer } from "../types/ipc";

import "./ModManagerModal.css";

interface ModManagerModalProps {
  server: SteamServer;
  onClose: () => void;
}

export function ModManagerModal({
  server,
  onClose,
}: ModManagerModalProps): JSX.Element {
  const [mods, setMods] = useState<ServerModSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    const result = await window.electron.listServerMods(
      server.appId,
      server.installPath
    );
    if (!result.success) {
      setError(result.error ?? "Failed to list mods");
      setMods([]);
      return;
    }
    setError(null);
    setMods(result.mods);
  }, [server.appId, server.installPath]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleAddZip(): Promise<void> {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await window.electron.selectAndImportModZip(
        server.appId,
        server.installPath
      );
      if (result.canceled) {
        return;
      }
      if (!result.success) {
        setError(result.error ?? "Import failed");
        return;
      }
      setMessage(
        result.mod
          ? `Imported and enabled “${result.mod.displayName}”`
          : "Mod imported and enabled"
      );
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleToggle(mod: ServerModSummary): Promise<void> {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await window.electron.setServerModEnabled(
        mod.id,
        !mod.enabled
      );
      if (!result.success) {
        setError(result.error ?? "Failed to update mod");
        return;
      }
      setMessage(mod.enabled ? `Disabled “${mod.displayName}”` : `Enabled “${mod.displayName}”`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(mod: ServerModSummary): Promise<void> {
    const ok = window.confirm(
      `Permanently remove “${mod.displayName}”? Overwritten files will be restored from backups.`
    );
    if (!ok) {
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await window.electron.removeServerMod(mod.id);
      if (!result.success) {
        setError(result.error ?? "Failed to remove mod");
        return;
      }
      setMessage(`Removed “${mod.displayName}”`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="mod-manager-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mod-manager-title"
    >
      <div className="mod-manager-modal">
        <div className="mod-manager-header">
          <div>
            <h2 id="mod-manager-title">Mod Manager</h2>
            <p className="mod-manager-subtitle">{server.name}</p>
          </div>
          <button
            type="button"
            className="close-btn"
            onClick={onClose}
            aria-label="Close mod manager"
          >
            ×
          </button>
        </div>
        <div className="mod-manager-body">
          <p className="mod-manager-hint">
            Import a downloaded mod <code>.zip</code>. Official packages with{" "}
            <code>Info.json</code> stage under <code>Mods/Workshop</code>;
            path-rooted zips deploy under <code>Pal/</code> or <code>Mods/</code>.
            Restart the server to apply official loader deployment.
          </p>
          <div className="mod-manager-toolbar">
            <button
              type="button"
              className="btn btn-mod-add-zip"
              disabled={busy}
              onClick={() => {
                void handleAddZip();
              }}
            >
              Add zip file
            </button>
          </div>
          {error && (
            <p className="mod-manager-error" role="alert">
              {error}
            </p>
          )}
          {message && <p className="mod-manager-message">{message}</p>}
          {mods.length === 0 ? (
            <p className="mod-manager-empty">No mods imported yet.</p>
          ) : (
            <ul className="mod-manager-list">
              {mods.map((mod) => (
                <li key={mod.id} className="mod-manager-row">
                  <div className="mod-manager-row-info">
                    <span className="mod-manager-row-name">{mod.displayName}</span>
                    <span className="mod-manager-row-meta">
                      {mod.kind === "workshop" ? "Workshop" : "Path deploy"}
                      {mod.packageName ? ` · ${mod.packageName}` : ""}
                      {mod.sourceZipName ? ` · ${mod.sourceZipName}` : ""}
                    </span>
                  </div>
                  <div className="mod-manager-row-actions">
                    <button
                      type="button"
                      className="btn btn-mod-toggle"
                      disabled={busy}
                      onClick={() => {
                        void handleToggle(mod);
                      }}
                    >
                      {mod.enabled ? "Disable" : "Enable"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-mod-trash"
                      disabled={busy}
                      title="Remove mod and revert file changes"
                      aria-label={`Remove ${mod.displayName}`}
                      onClick={() => {
                        void handleRemove(mod);
                      }}
                    >
                      🗑️
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
