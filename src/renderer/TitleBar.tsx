import { useState, useEffect } from "react";
import "./TitleBar.css";

type WC = {
  minimize?: () => Promise<void>;
  toggleMaximize?: () => Promise<{ success?: boolean; maximized?: boolean } | void>;
  close?: () => Promise<void>;
};

export function TitleBar(): JSX.Element {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    const handle = async (): Promise<void> => {
      // No-op for now; we could subscribe to events if needed
    };
    void handle();
  }, []);

  const minimize = async (): Promise<void> => {
    try {
      const wc = window.electron.windowControls as WC | undefined;
      if (wc !== undefined && typeof wc.minimize === "function") {
        await wc.minimize();
      }
    } catch (err) {
      console.error("Failed to minimize window", err);
    }
  };

  const toggleMaximize = async (): Promise<void> => {
    try {
      const wc = window.electron.windowControls as WC | undefined;
      if (wc !== undefined && typeof wc.toggleMaximize === "function") {
        const res = (await wc.toggleMaximize()) as { success?: boolean; maximized?: boolean } | void;
        if (res && typeof (res as { maximized?: unknown }).maximized === "boolean") {
          setIsMaximized((res as { maximized?: boolean }).maximized as boolean);
        }
      }
    } catch (err) {
      console.error("Failed to toggle maximize", err);
    }
  };

  const close = async (): Promise<void> => {
    try {
      const wc = window.electron.windowControls as WC | undefined;
      if (wc !== undefined && typeof wc.close === "function") {
        await wc.close();
      }
    } catch (err) {
      console.error("Failed to close window", err);
    }
  };

  return (
    <div className="titlebar" title="Drag to move window">
      <div className="titlebar-left-pill">
        <div className="titlebar-drag">Steam Server Manager</div>
      </div>
      <div className="titlebar-controls">
        <button className="titlebar-icon" onClick={() => { void minimize(); }} aria-label="Minimize">—</button>
        <button className="titlebar-icon" onClick={() => { void toggleMaximize(); }} aria-label="Maximize">{isMaximized ? '❐' : '▢'}</button>
        <button className="titlebar-icon close" onClick={() => { void close(); }} aria-label="Close">✕</button>
      </div>
    </div>
  );
}

export default TitleBar;
