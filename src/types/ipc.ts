/**
 * Shared IPC contract between the main process, the preload bridge and the
 * renderer. Every channel registered in `src/main/registerIpcHandlers.ts`
 * and `src/main/windowControls.ts` must have an entry in `IpcInvokeMap`.
 *
 * This module is intentionally free of Electron/Node/React imports so it can
 * be consumed from all three processes without circular dependencies.
 */

export interface SteamServer {
  name: string;
  appId: number;
  installPath: string;
  isRunning: boolean;
  coverArt?: string;
  /**
   * Catalog capability flags for this app (e.g. rest_admin, live_ops).
   * Empty when the game has no optional features.
   */
  capabilities?: ServerCapabilityId[];
}

/**
 * Optional per-game features owned by the SQLite catalog
 * (`server_capabilities`). Renderer UI keys off these instead of app ids.
 */
export type ServerCapabilityId = "rest_admin" | "live_ops" | "update_announce";

export type ConfigFormat = "json" | "ini";

/**
 * Steam app id for Palworld Dedicated Server.
 * Prefer catalog capability checks for feature gating; this constant remains
 * for tests and seed/docs references.
 */
export const PALWORLD_APP_ID = 1623730;

/** Base shape returned by action-style IPC handlers. */
export interface IpcActionResult {
  success: boolean;
  error?: string;
}

export type CheckDiagnosticsResponse = Record<
  string,
  boolean | string | string[]
>;

export interface GetSteamServersResponse extends IpcActionResult {
  servers: SteamServer[];
}

export interface BackupServerSaveResponse extends IpcActionResult {
  backupPath?: string;
}

export interface SelectBackupFolderResponse extends IpcActionResult {
  path: string | null;
}

export interface SelectSteamCmdPathResponse extends IpcActionResult {
  path: string | null;
}

export interface GetServerConfigResponse extends IpcActionResult {
  content?: Record<string, unknown>;
  format?: ConfigFormat;
  filePath?: string;
}

export interface WindowMaximizeToggleResponse extends IpcActionResult {
  maximized?: boolean;
}

/** Stage of the auto-update state machine a result refers to. */
export type AutoUpdateStage =
  | "validating"
  | "resolving-steamcmd"
  | "checking"
  | "notifying"
  | "stopping"
  | "updating"
  | "verifying"
  | "restarting"
  | "no-update"
  | "complete";

export interface AutoUpdateServerResponse extends IpcActionResult {
  /** Stage the update finished at (or failed in, when success is false). */
  stage: AutoUpdateStage;
  /** True when a new build was downloaded and the server was restarted. */
  updated: boolean;
  previousBuildId?: string | null;
  newBuildId?: string | null;
}

export interface ServerPersistedSettings {
  autoRestart: boolean;
  autoUpdate: boolean;
  backupPath?: string;
  backupIntervalSeconds?: number;
  /** Epic 020: live Palworld ops panel toggle. */
  palworldOpsEnabled?: boolean;
  /** Epic 020: poll interval in seconds for live ops. */
  palworldOpsIntervalSeconds?: number;
}

/** Palworld REST endpoints under `/v1/api/*`. */
export type PalworldRestEndpoint =
  | "info"
  | "players"
  | "settings"
  | "metrics"
  | "game-data"
  | "announce"
  | "kick"
  | "ban"
  | "unban"
  | "save"
  | "shutdown"
  | "stop";

export interface PalworldRestStatusResponse extends IpcActionResult {
  enabled: boolean;
  isPalworld: boolean;
  port?: number;
}

export interface PalworldRestCallResult extends IpcActionResult {
  data?: unknown;
}

export interface AppSettings {
  selectedSteamPath?: string;
  /** Path to the steamcmd executable used for forced server updates. */
  steamCmdPath?: string;
  /** Keyed by Steam appId (stringified number). */
  servers: Record<string, ServerPersistedSettings>;
}

export interface GetSettingsResponse extends IpcActionResult {
  settings: AppSettings;
}

/** Rolling-window statistics for one resource metric. */
export interface MetricStats {
  current: number;
  average: number;
  p95: number;
}

export interface GetServerMetricsResponse extends IpcActionResult {
  /** True while the main process is actively sampling this server. */
  running: boolean;
  /** Number of samples currently in the rolling window. */
  sampleCount: number;
  /** CPU usage in percent of one core's wall time; absent until sampled. */
  cpu?: MetricStats;
  /** Resident memory in bytes; absent until sampled. */
  memory?: MetricStats;
}

/** App auto-update status pushed from main → renderer (epic 012). */
export type AppUpdateStatus =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "available"; version: string; currentVersion: string }
  | { state: "not-available" }
  | { state: "downloading"; percent: number }
  | { state: "ready"; version: string }
  | { state: "error"; message: string };

/**
 * Structured outcome of a manual app-update check (epic 037.2) — never a
 * silent success: busy/disabled/error states are reported explicitly so the
 * UI can show meaningful feedback.
 */
export type ManualUpdateCheckResult =
  | { outcome: "update-available"; version: string }
  | { outcome: "up-to-date" }
  | { outcome: "disabled" }
  | { outcome: "busy"; message?: string }
  | { outcome: "error"; message: string };

/** Main → renderer push event channels (not invoke). */
export type IpcEventChannel = "app-update-status";

/**
 * Request/response contract for every `ipcRenderer.invoke` channel.
 * `args` is the tuple of arguments after the channel name; `result` is the
 * resolved value of the returned promise.
 */
export interface IpcInvokeMap {
  "get-app-version": { args: []; result: string };
  "check-diagnostics": { args: []; result: CheckDiagnosticsResponse };
  "get-steam-paths": { args: []; result: string[] };
  "get-steam-servers": {
    args: [path?: string];
    result: GetSteamServersResponse;
  };
  "run-server": {
    args: [appId: number, installPath: string];
    result: IpcActionResult;
  };
  "stop-server": {
    args: [appId: number, installPath: string];
    result: IpcActionResult;
  };
  "auto-update-server": {
    args: [appId: number, installPath: string, steamPath: string];
    result: AutoUpdateServerResponse;
  };
  "backup-server-save": {
    args: [appId: number, installPath: string, backupPath: string];
    result: BackupServerSaveResponse;
  };
  "select-backup-folder": { args: []; result: SelectBackupFolderResponse };
  "select-steamcmd-path": { args: []; result: SelectSteamCmdPathResponse };
  "get-server-config": {
    args: [appId: number, installPath: string];
    result: GetServerConfigResponse;
  };
  "get-server-output": {
    args: [appId: number];
    result: string;
  };
  "get-server-metrics": {
    args: [appId: number];
    result: GetServerMetricsResponse;
  };
  "open-file-default": { args: [filePath: string]; result: IpcActionResult };
  "save-server-config": {
    args: [
      appId: number,
      installPath: string,
      content: Record<string, unknown>,
      format: ConfigFormat,
    ];
    result: IpcActionResult;
  };
  "get-settings": { args: []; result: GetSettingsResponse };
  "save-settings": { args: [settings: AppSettings]; result: IpcActionResult };
  "app-update-check": { args: []; result: ManualUpdateCheckResult };
  "app-update-install": { args: []; result: IpcActionResult };
  "window-minimize": { args: []; result: IpcActionResult };
  "window-maximize-toggle": {
    args: [];
    result: WindowMaximizeToggleResponse;
  };
  "window-close": { args: []; result: IpcActionResult };
  "palworld-rest-status": {
    args: [appId: number, installPath: string];
    result: PalworldRestStatusResponse;
  };
  "palworld-rest-request": {
    args: [
      appId: number,
      installPath: string,
      method: "GET" | "POST",
      endpoint: PalworldRestEndpoint,
      body?: Record<string, unknown>,
    ];
    result: PalworldRestCallResult;
  };
}

export type IpcChannel = keyof IpcInvokeMap;

export type IpcInvokeArgs<C extends IpcChannel> = IpcInvokeMap[C]["args"];

export type IpcInvokeResult<C extends IpcChannel> = IpcInvokeMap[C]["result"];

export interface ElectronWindowControls {
  minimize: () => Promise<IpcActionResult>;
  toggleMaximize: () => Promise<WindowMaximizeToggleResponse>;
  close: () => Promise<IpcActionResult>;
}

/** Typed API surface the preload script exposes as `window.electron`. */
export interface ElectronAPI {
  getAppVersion: () => Promise<string>;
  checkDiagnostics: () => Promise<CheckDiagnosticsResponse>;
  getSteamPaths: () => Promise<string[]>;
  getSteamServers: (path?: string) => Promise<GetSteamServersResponse>;
  runServer: (appId: number, installPath: string) => Promise<IpcActionResult>;
  stopServer: (appId: number, installPath: string) => Promise<IpcActionResult>;
  autoUpdateServer: (
    appId: number,
    installPath: string,
    steamPath: string
  ) => Promise<AutoUpdateServerResponse>;
  backupServerSave: (
    appId: number,
    installPath: string,
    backupPath: string
  ) => Promise<BackupServerSaveResponse>;
  selectBackupFolder: () => Promise<SelectBackupFolderResponse>;
  selectSteamCmdPath: () => Promise<SelectSteamCmdPathResponse>;
  getServerConfig: (
    appId: number,
    installPath: string
  ) => Promise<GetServerConfigResponse>;
  getServerOutput: (appId: number) => Promise<string>;
  getServerMetrics: (appId: number) => Promise<GetServerMetricsResponse>;
  openFileDefault: (filePath: string) => Promise<IpcActionResult>;
  saveServerConfig: (
    appId: number,
    installPath: string,
    content: Record<string, unknown>,
    format: ConfigFormat
  ) => Promise<IpcActionResult>;
  getSettings: () => Promise<GetSettingsResponse>;
  saveSettings: (settings: AppSettings) => Promise<IpcActionResult>;
  checkForAppUpdate: () => Promise<ManualUpdateCheckResult>;
  installAppUpdate: () => Promise<IpcActionResult>;
  onAppUpdateStatus: (
    callback: (status: AppUpdateStatus) => void
  ) => () => void;
  getPalworldRestStatus: (
    appId: number,
    installPath: string
  ) => Promise<PalworldRestStatusResponse>;
  palworldRestRequest: (
    appId: number,
    installPath: string,
    method: "GET" | "POST",
    endpoint: PalworldRestEndpoint,
    body?: Record<string, unknown>
  ) => Promise<PalworldRestCallResult>;
  windowControls: ElectronWindowControls;
}
