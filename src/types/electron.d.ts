import type { ElectronAPI, SteamServer } from "./ipc";

export type { SteamServer };

declare global {
  interface Window {
    electron: ElectronAPI;
  }
}
