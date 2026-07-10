interface SteamPathSelectorProps {
  paths: string[];
  selectedPath: string;
  onSelect: (path: string) => void;
}

export function SteamPathSelector({
  paths,
  selectedPath,
  onSelect,
}: SteamPathSelectorProps): JSX.Element | null {
  if (paths.length === 0) {
    return null;
  }

  return (
    <div className="steam-path-selector">
      <label htmlFor="steam-path-select">Steam Library:</label>
      <select
        id="steam-path-select"
        value={selectedPath}
        onChange={(e) => onSelect(e.target.value)}
      >
        {paths.map((path) => (
          <option key={path} value={path}>
            {path}
          </option>
        ))}
      </select>
    </div>
  );
}
