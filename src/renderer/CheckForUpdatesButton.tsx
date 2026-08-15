import { useState } from "react";

import "./CheckForUpdatesButton.css";
import {
  CHECKING_UPDATES_MESSAGE,
  formatManualUpdateCheckMessage,
  statusToneForResult,
  type UpdateCheckStatusTone,
} from "./manualCheckMessage";

function CheckForUpdatesButton(): JSX.Element {
  const [checking, setChecking] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusTone, setStatusTone] = useState<UpdateCheckStatusTone | null>(
    null
  );

  const handleCheck = (): void => {
    setChecking(true);
    setStatusMessage(CHECKING_UPDATES_MESSAGE);
    setStatusTone("pending");
    void (async (): Promise<void> => {
      try {
        const result = await window.electron.checkForAppUpdate();
        setStatusMessage(formatManualUpdateCheckMessage(result));
        setStatusTone(statusToneForResult(result));
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Update check failed";
        setStatusMessage(
          formatManualUpdateCheckMessage({ outcome: "error", message })
        );
        setStatusTone("failed");
      } finally {
        setChecking(false);
      }
    })();
  };

  return (
    <div className="update-check">
      <button
        type="button"
        className="update-check-button"
        onClick={handleCheck}
        disabled={checking}
      >
        Check for updates
      </button>
      {statusMessage !== null && statusTone !== null ? (
        <p
          className={`update-check-status update-check-status-${statusTone}`}
          role="status"
          aria-live="polite"
        >
          {statusMessage}
        </p>
      ) : null}
    </div>
  );
}

export default CheckForUpdatesButton;
