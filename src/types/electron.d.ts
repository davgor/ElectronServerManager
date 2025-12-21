export interface SteamServer {
  name: string;
  appId: number;
  installPath: string;
  isRunning: boolean;
  coverArt?: string;
}

export interface ElectronAPI {
  ipcRenderer: {
    send: (channel: string, ...args: unknown[]) => void;
    on: (channel: string, func: (...args: unknown[]) => void) => void;
    once: (channel: string, func: (...args: unknown[]) => void) => void;
    invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
  };
}

declare global {
  interface Window {
    electron: ElectronAPI;
  }
}
