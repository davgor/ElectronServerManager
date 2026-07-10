import type {
  BackupServerSaveResponse,
  CheckDiagnosticsResponse,
  ConfigFormat,
  ElectronWindowControls,
  GetServerConfigResponse,
  GetSteamServersResponse,
  IpcActionResult,
  IpcChannel,
  IpcInvokeArgs,
  IpcInvokeMap,
  IpcInvokeResult,
  SelectBackupFolderResponse,
  SteamServer,
  WindowMaximizeToggleResponse,
} from "../../types/ipc";

/**
 * Every channel registered by the main process (registerIpcHandlers.ts +
 * windowControls.ts). The compile-time assertions below force IpcInvokeMap
 * to stay in sync with this list in both directions.
 */
const EXPECTED_CHANNELS = [
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
  "open-file-default",
  "save-server-config",
  "window-minimize",
  "window-maximize-toggle",
  "window-close",
] as const;

type ExpectedChannel = (typeof EXPECTED_CHANNELS)[number];

// Compile-time: every expected channel is a valid IpcChannel...
const expectedAreChannels: readonly IpcChannel[] = EXPECTED_CHANNELS;
// ...and every IpcChannel is an expected channel.
const channelsAreExpected: readonly ExpectedChannel[] = [] as IpcChannel[];

describe("IPC types", () => {
  it("covers every registered IPC channel", () => {
    expect(expectedAreChannels).toHaveLength(15);
    expect(channelsAreExpected).toHaveLength(0);
  });

  it("exposes args/result entries through IpcInvokeMap", () => {
    const versionEntry: IpcInvokeMap["get-app-version"] = {
      args: [],
      result: "1.0.11",
    };
    const runEntry: IpcInvokeMap["run-server"] = {
      args: [1396110, "/steam/valheim"],
      result: { success: true },
    };

    expect(versionEntry.result).toBe("1.0.11");
    expect(runEntry.args[0]).toBe(1396110);
    expect(runEntry.result.success).toBe(true);
  });

  it("types get-steam-servers request and response", () => {
    const args: IpcInvokeArgs<"get-steam-servers"> = ["/opt/steam"];
    const noPathArgs: IpcInvokeArgs<"get-steam-servers"> = [];

    const server: SteamServer = {
      name: "Valheim",
      appId: 1396110,
      installPath: "/steam/valheim",
      isRunning: true,
      coverArt: "data:image/png;base64,abc",
    };

    const response: IpcInvokeResult<"get-steam-servers"> = {
      success: true,
      servers: [server],
    };
    const failure: GetSteamServersResponse = {
      success: false,
      servers: [],
      error: "Steam not found",
    };

    expect(args[0]).toBe("/opt/steam");
    expect(noPathArgs).toHaveLength(0);
    expect(response.servers[0].appId).toBe(1396110);
    expect(failure.error).toBe("Steam not found");
  });

  it("types server action channels with shared action result", () => {
    const runArgs: IpcInvokeArgs<"run-server"> = [1396110, "/steam/valheim"];
    const stopArgs: IpcInvokeArgs<"stop-server"> = [1396110, "/steam/valheim"];
    const updateArgs: IpcInvokeArgs<"auto-update-server"> = [
      1396110,
      "/steam/valheim",
      "/opt/steam",
    ];

    const ok: IpcActionResult = { success: true };
    const failed: IpcInvokeResult<"run-server"> = {
      success: false,
      error: "Executable not found",
    };

    expect(runArgs).toHaveLength(2);
    expect(stopArgs).toHaveLength(2);
    expect(updateArgs).toHaveLength(3);
    expect(ok.success).toBe(true);
    expect(failed.error).toBe("Executable not found");
  });

  it("types backup channels", () => {
    const backupArgs: IpcInvokeArgs<"backup-server-save"> = [
      1396110,
      "/steam/valheim",
      "/backups",
    ];
    const backupResponse: BackupServerSaveResponse = {
      success: true,
      backupPath: "/backups/valheim-2026.zip",
    };
    const folderResponse: SelectBackupFolderResponse = {
      success: false,
      path: null,
    };
    const folderSelected: IpcInvokeResult<"select-backup-folder"> = {
      success: true,
      path: "/backups",
    };

    expect(backupArgs).toHaveLength(3);
    expect(backupResponse.backupPath).toContain("valheim");
    expect(folderResponse.path).toBeNull();
    expect(folderSelected.path).toBe("/backups");
  });

  it("types config channels", () => {
    const format: ConfigFormat = "ini";
    const readResponse: GetServerConfigResponse = {
      success: true,
      content: { ServerSettings: { MaxPlayers: 10 } },
      format,
      filePath: "/steam/valheim/config.ini",
    };
    const saveArgs: IpcInvokeArgs<"save-server-config"> = [
      1396110,
      "/steam/valheim",
      { ServerSettings: { MaxPlayers: 10 } },
      "json",
    ];
    const saveResponse: IpcInvokeResult<"save-server-config"> = {
      success: true,
    };
    const openArgs: IpcInvokeArgs<"open-file-default"> = [
      "/steam/valheim/config.ini",
    ];

    expect(readResponse.format).toBe("ini");
    expect(saveArgs[3]).toBe("json");
    expect(saveResponse.success).toBe(true);
    expect(openArgs[0]).toContain("config.ini");
  });

  it("types app metadata channels", () => {
    const version: IpcInvokeResult<"get-app-version"> = "1.0.11";
    const diagnostics: CheckDiagnosticsResponse = {
      canExecuteProcesses: true,
      platform: "linux",
      steamPaths: ["/opt/steam"],
    };
    const paths: IpcInvokeResult<"get-steam-paths"> = ["/opt/steam"];

    expect(version).toBe("1.0.11");
    expect(diagnostics.platform).toBe("linux");
    expect(paths).toHaveLength(1);
  });

  it("types window control channels", () => {
    const minimizeResponse: IpcInvokeResult<"window-minimize"> = {
      success: true,
    };
    const toggleResponse: WindowMaximizeToggleResponse = {
      success: true,
      maximized: true,
    };
    const closeResponse: IpcInvokeResult<"window-close"> = {
      success: false,
      error: "Main window not available",
    };
    const windowControls: ElectronWindowControls = {
      minimize: () => Promise.resolve(minimizeResponse),
      toggleMaximize: () => Promise.resolve(toggleResponse),
      close: () => Promise.resolve(closeResponse),
    };

    expect(minimizeResponse.success).toBe(true);
    expect(toggleResponse.maximized).toBe(true);
    expect(closeResponse.error).toBe("Main window not available");
    expect(typeof windowControls.toggleMaximize).toBe("function");
  });
});
