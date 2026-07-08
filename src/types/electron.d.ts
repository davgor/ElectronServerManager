import type { ElectronAPI, SteamServer } from "./ipc";

export type { ElectronAPI, SteamServer };

declare global {
  interface Window {
    electron: ElectronAPI;
  }
}
