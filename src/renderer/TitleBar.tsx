import { useEffect, useRef, useState } from "react";
import "./TitleBar.css";

function TitleBar(): JSX.Element {
  const [isMaximized, setIsMaximized] = useState(false);
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    void (async (): Promise<void> => {
      try {
        const version = await window.electron.getAppVersion();
        if (cancelledRef.current) {
          return;
        }
        if (version.trim().length > 0) {
          setAppVersion(version);
        }
      } catch (err) {
        console.error("Failed to load app version", err);
      }
    })();
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  const minimize = async (): Promise<void> => {
    try {
      await window.electron.windowControls.minimize();
    } catch (err) {
      console.error("Failed to minimize window", err);
    }
  };

  const toggleMaximize = async (): Promise<void> => {
    try {
      const res = await window.electron.windowControls.toggleMaximize();
      if (typeof res.maximized === "boolean") {
        setIsMaximized(res.maximized);
      }
    } catch (err) {
      console.error("Failed to toggle maximize", err);
    }
  };

  const close = async (): Promise<void> => {
    try {
      await window.electron.windowControls.close();
    } catch (err) {
      console.error("Failed to close window", err);
    }
  };

  return (
    <div className="titlebar" title="Drag to move window">
      <div className="titlebar-left-pill">
        <div className="titlebar-drag">Steam Server Manager</div>
        {appVersion !== null ? (
          <span className="titlebar-version" aria-label="App version">
            v{appVersion}
          </span>
        ) : null}
      </div>
      <div className="titlebar-controls">
        <button
          className="titlebar-icon"
          onClick={() => {
            void minimize();
          }}
          aria-label="Minimize"
        >
          —
        </button>
        <button
          className="titlebar-icon"
          onClick={() => {
            void toggleMaximize();
          }}
          aria-label="Maximize"
        >
          {isMaximized ? "❐" : "▢"}
        </button>
        <button
          className="titlebar-icon close"
          onClick={() => {
            void close();
          }}
          aria-label="Close"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

export default TitleBar;
