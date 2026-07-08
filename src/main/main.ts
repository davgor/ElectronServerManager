import { Menu, dialog } from "electron";

import { getMainWindow, registerAppLifecycle } from "./appWindow";
import { registerIpcHandlers } from "./registerIpcHandlers";

const isDev = Boolean(
  process.env.NODE_ENV === "development" || process.env.ELECTRON_START_URL
);

registerAppLifecycle(isDev);
registerIpcHandlers({ getMainWindow, dialogApi: dialog });
Menu.setApplicationMenu(null);
