import { contextBridge, ipcRenderer } from "electron";

type Args = readonly unknown[];

contextBridge.exposeInMainWorld("electron", {
  ipcRenderer: {
    send: (channel: string, ...args: Args): void => {
      ipcRenderer.send(channel, ...(args as unknown[]));
    },
    on: (channel: string, func: (...args: Args) => void): void => {
      ipcRenderer.on(channel, (_event, ...args) => func(...(args as Args)));
    },
    once: (channel: string, func: (...args: Args) => void): void => {
      ipcRenderer.once(channel, (_event, ...args) => func(...(args as Args)));
    },
    invoke: (channel: string, ...args: Args): Promise<unknown> =>
      ipcRenderer.invoke(channel, ...(args as unknown[])),
  },
  windowControls: {
    minimize: async (): Promise<unknown> => ipcRenderer.invoke("window-minimize"),
    toggleMaximize: async (): Promise<unknown> => ipcRenderer.invoke("window-maximize-toggle"),
    close: async (): Promise<unknown> => ipcRenderer.invoke("window-close"),
  },
});
