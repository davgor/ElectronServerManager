/**
 * Line-oriented editor for Palworld `Mods/PalModSettings.ini`.
 *
 * `ActiveModList` is intentionally repeated (one line per package). The generic
 * INI parser collapses duplicate keys, so this module must not use it.
 */

const SECTION = "[PalModSettings]";

interface PalModSettingsState {
  globalEnable: boolean;
  activeMods: string[];
  /** Other lines inside the section (comments / unknown keys), preserved. */
  otherSectionLines: string[];
  /** Content outside [PalModSettings], preserved. */
  preamble: string;
}

export function readPalModSettings(content: string): PalModSettingsState {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const preamble: string[] = [];
  const otherSectionLines: string[] = [];
  const activeMods: string[] = [];
  let globalEnable = false;
  let inSection = false;
  let sawSection = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      inSection = trimmed === SECTION;
      if (inSection) {
        sawSection = true;
      } else if (!sawSection) {
        preamble.push(line);
      } else {
        otherSectionLines.push(line);
      }
      continue;
    }
    if (!inSection) {
      if (!sawSection) {
        preamble.push(line);
      } else {
        otherSectionLines.push(line);
      }
      continue;
    }
    if (trimmed.startsWith("bGlobalEnableMod=")) {
      globalEnable =
        trimmed.slice("bGlobalEnableMod=".length).toLowerCase() === "true";
      continue;
    }
    if (trimmed.startsWith("ActiveModList=")) {
      const name = trimmed.slice("ActiveModList=".length).trim();
      if (name) {
        activeMods.push(name);
      }
      continue;
    }
    if (trimmed !== "") {
      otherSectionLines.push(line);
    }
  }

  return {
    globalEnable,
    activeMods,
    otherSectionLines: otherSectionLines.filter((l) => l.trim() !== ""),
    preamble: preamble.join("\n").replace(/\n+$/, ""),
  };
}

export function writePalModSettings(state: PalModSettingsState): string {
  const body: string[] = [
    SECTION,
    `bGlobalEnableMod=${state.globalEnable ? "true" : "false"}`,
  ];
  for (const mod of state.activeMods) {
    body.push(`ActiveModList=${mod}`);
  }
  for (const line of state.otherSectionLines) {
    body.push(line);
  }
  const sectionText = `${body.join("\n")}\n`;
  if (state.preamble.trim() === "") {
    return sectionText;
  }
  return `${state.preamble}\n${sectionText}`;
}

export function listActiveMods(content: string): string[] {
  return readPalModSettings(content).activeMods;
}

export function addActiveMod(content: string, packageName: string): string {
  const state = readPalModSettings(content);
  state.globalEnable = true;
  if (!state.activeMods.includes(packageName)) {
    state.activeMods.push(packageName);
  }
  return writePalModSettings(state);
}

export function removeActiveMod(content: string, packageName: string): string {
  const state = readPalModSettings(content);
  state.activeMods = state.activeMods.filter((m) => m !== packageName);
  return writePalModSettings(state);
}
