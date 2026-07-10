import { useEffect, useState } from "react";

interface SteamCmdPathInputProps {
  /** Persisted steamcmd path ("" when unset — auto-detection applies). */
  value: string;
  onChange: (path: string) => void;
}

/**
 * Text input for the steamcmd executable path used by auto-updates.
 * Edits are kept locally while typing and persisted on blur.
 */
export function SteamCmdPathInput({
  value,
  onChange,
}: SteamCmdPathInputProps): JSX.Element {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

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
    </div>
  );
}
