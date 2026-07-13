import { Menu, app, dialog } from "electron";
import { autoUpdater } from "electron-updater";

import { registerAppUpdater } from "./appUpdater";
import { getMainWindow, registerAppLifecycle } from "./appWindow";
import { initCatalog } from "./catalog/initCatalog";
import { registerIpcHandlers } from "./registerIpcHandlers";

const isDev = Boolean(
  process.env.NODE_ENV === "development" || process.env.ELECTRON_START_URL
);

// Catalog must initialize before the ready handler that creates the window
// (listeners run in registration order).
app.on("ready", () => {
  initCatalog(app.getPath("userData"));
});

registerAppLifecycle(isDev);
registerIpcHandlers({ getMainWindow, dialogApi: dialog });
Menu.setApplicationMenu(null);

void app.whenReady().then(() => {
  registerAppUpdater({
    autoUpdater,
    getMainWindow,
    // Dev (`npm start`) and unpackaged builds must not hit the public feed.
    isPackaged: app.isPackaged && !isDev,
    currentVersion: app.getVersion(),
  });
});
