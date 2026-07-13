import { useEffect, useState } from "react";

import type { AppUpdateStatus } from "../types/ipc";

import "./UpdateBanner.css";

function UpdateBanner(): JSX.Element | null {
  const [status, setStatus] = useState<AppUpdateStatus>({ state: "idle" });
  const [installError, setInstallError] = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    return window.electron.onAppUpdateStatus((next) => {
      setStatus(next);
      if (next.state !== "error") {
        setInstallError(null);
      }
    });
  }, []);

  const handleInstall = (): void => {
    setInstalling(true);
    setInstallError(null);
    void (async (): Promise<void> => {
      try {
        const result = await window.electron.installAppUpdate();
        if (!result.success) {
          setInstallError(result.error ?? "Failed to install update");
          setInstalling(false);
        }
      } catch (err) {
        setInstallError(
          err instanceof Error ? err.message : "Failed to install update"
        );
        setInstalling(false);
      }
    })();
  };

  if (status.state === "idle" || status.state === "not-available") {
    return null;
  }

  if (status.state === "checking") {
    return (
      <div className="update-banner" role="status">
        Checking for app updates…
      </div>
    );
  }

  if (status.state === "available") {
    return (
      <div className="update-banner" role="status">
        Update available: v{status.currentVersion} → v{status.version}
      </div>
    );
  }

  if (status.state === "downloading") {
    const percent = Number.isFinite(status.percent)
      ? Math.round(status.percent)
      : null;
    return (
      <div className="update-banner" role="status">
        {percent === null
          ? "Downloading update…"
          : `Downloading update… ${percent}%`}
        <div className="update-banner-progress" aria-hidden={percent === null}>
          <div
            className="update-banner-progress-bar"
            style={{ width: `${percent ?? 100}%` }}
          />
        </div>
      </div>
    );
  }

  if (status.state === "ready") {
    return (
      <div className="update-banner update-banner-ready" role="status">
        <span>Update v{status.version} ready — restart to apply</span>
        <button
          type="button"
          className="update-banner-action"
          onClick={handleInstall}
          disabled={installing}
        >
          {installing ? "Restarting…" : "Restart & Install"}
        </button>
        {installError !== null ? (
          <span className="update-banner-error">{installError}</span>
        ) : null}
      </div>
    );
  }

  return (
    <div className="update-banner update-banner-error" role="alert">
      Update error: {status.message}
    </div>
  );
}

export default UpdateBanner;
