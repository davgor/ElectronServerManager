import { contextBridge, ipcRenderer } from "electron";

import type {
  AppSettings,
  AppUpdateStatus,
  ElectronAPI,
  IpcChannel,
  IpcEventChannel,
  IpcInvokeArgs,
  IpcInvokeResult,
} from "../types/ipc";

/**
 * Every IPC channel the renderer is allowed to reach. This must stay in sync
 * with the handlers registered in `src/main/registerIpcHandlers.ts` and
 * `src/main/windowControls.ts`; `src/__tests__/preload/preload.test.ts`
 * enforces the pairing.
 *
 * Kept in this file (rather than imported) because sandboxed preload scripts
 * cannot require project modules at runtime — only type imports are safe.
 */
export const ALLOWED_CHANNELS: readonly IpcChannel[] = [
  "get-app-version",
  "check-diagnostics",
  "get-steam-paths",
  "get-steam-servers",
  "run-server",
  "stop-server",
  "auto-update-server",
  "backup-server-save",
  "select-backup-folder",
  "get-server-config",
  "get-server-output",
  "open-file-default",
  "save-server-config",
  "get-settings",
  "save-settings",
  "app-update-check",
  "app-update-install",
  "window-minimize",
  "window-maximize-toggle",
  "window-close",
] as const;

export const ALLOWED_EVENTS: readonly IpcEventChannel[] = [
  "app-update-status",
] as const;

export function isAllowedChannel(channel: string): channel is IpcChannel {
  return (ALLOWED_CHANNELS as readonly string[]).includes(channel);
}

export function isAllowedEvent(channel: string): channel is IpcEventChannel {
  return (ALLOWED_EVENTS as readonly string[]).includes(channel);
}

export async function invokeIpc<C extends IpcChannel>(
  channel: C,
  ...args: IpcInvokeArgs<C>
): Promise<IpcInvokeResult<C>> {
  if (!isAllowedChannel(channel)) {
    throw new Error(
      `Blocked invoke on disallowed IPC channel: ${String(channel)}`
    );
  }
  return (await ipcRenderer.invoke(channel, ...args)) as IpcInvokeResult<C>;
}

const electronApi: ElectronAPI = {
  getAppVersion: () => invokeIpc("get-app-version"),
  checkDiagnostics: () => invokeIpc("check-diagnostics"),
  getSteamPaths: () => invokeIpc("get-steam-paths"),
  getSteamServers: (path?: string) => invokeIpc("get-steam-servers", path),
  runServer: (appId: number, installPath: string) =>
    invokeIpc("run-server", appId, installPath),
  stopServer: (appId: number, installPath: string) =>
    invokeIpc("stop-server", appId, installPath),
  autoUpdateServer: (appId: number, installPath: string, steamPath: string) =>
    invokeIpc("auto-update-server", appId, installPath, steamPath),
  backupServerSave: (appId: number, installPath: string, backupPath: string) =>
    invokeIpc("backup-server-save", appId, installPath, backupPath),
  selectBackupFolder: () => invokeIpc("select-backup-folder"),
  getServerConfig: (appId: number, installPath: string) =>
    invokeIpc("get-server-config", appId, installPath),
  getServerOutput: (appId: number) => invokeIpc("get-server-output", appId),
  openFileDefault: (filePath: string) =>
    invokeIpc("open-file-default", filePath),
  saveServerConfig: (
    appId: number,
    installPath: string,
    content: Record<string, unknown>,
    format: "json" | "ini"
  ) => invokeIpc("save-server-config", appId, installPath, content, format),
  getSettings: () => invokeIpc("get-settings"),
  saveSettings: (settings: AppSettings) => invokeIpc("save-settings", settings),
  checkForAppUpdate: () => invokeIpc("app-update-check"),
  installAppUpdate: () => invokeIpc("app-update-install"),
  onAppUpdateStatus: (callback: (status: AppUpdateStatus) => void) => {
    const channel = "app-update-status" as const;
    if (!isAllowedEvent(channel)) {
      throw new Error(
        `Blocked listener on disallowed IPC event: ${String(channel)}`
      );
    }
    const listener = (_event: unknown, status: AppUpdateStatus): void => {
      callback(status);
    };
    ipcRenderer.on(channel, listener);
    return () => {
      ipcRenderer.removeListener(channel, listener);
    };
  },
  windowControls: {
    minimize: () => invokeIpc("window-minimize"),
    toggleMaximize: () => invokeIpc("window-maximize-toggle"),
    close: () => invokeIpc("window-close"),
  },
};

contextBridge.exposeInMainWorld("electron", electronApi);
