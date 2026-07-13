import { useEffect, useState } from "react";

interface SteamCmdPathInputProps {
  /** Persisted steamcmd path ("" when unset — auto-detection applies). */
  value: string;
  onChange: (path: string) => void;
}

/**
 * Path field for the steamcmd executable used by auto-updates.
 * Supports typing (persisted on blur) or a native file picker via Browse.
 */
export function SteamCmdPathInput({
  value,
  onChange,
}: SteamCmdPathInputProps): JSX.Element {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const handleBrowse = async (): Promise<void> => {
    const result = await window.electron.selectSteamCmdPath();
    if (result.success && result.path !== null && result.path.length > 0) {
      setDraft(result.path);
      onChange(result.path);
    }
  };

  return (
    <div className="steamcmd-path-input">
      <label htmlFor="steamcmd-path">SteamCMD Path:</label>
      <input
        id="steamcmd-path"
        type="text"
        placeholder="Leave empty to auto-detect steamcmd"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== value) {
            onChange(draft);
          }
        }}
      />
      <button
        type="button"
        className="btn btn-browse"
        onClick={() => {
          void handleBrowse();
        }}
      >
        Browse
      </button>
    </div>
  );
}
