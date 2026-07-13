/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import App from "../../renderer/App";
import type { ElectronAPI } from "../../types/ipc";

const mockGetSteamPaths = jest.fn();
const mockGetSteamServers = jest.fn();
const mockRunServer = jest.fn();
const mockStopServer = jest.fn();
const mockGetSettings = jest.fn();
const mockSaveSettings = jest.fn();

const mockElectronApi: ElectronAPI = {
  getAppVersion: jest.fn().mockResolvedValue("0.0.0-test"),
  checkDiagnostics: jest.fn().mockResolvedValue({}),
  getSteamPaths: mockGetSteamPaths,
  getSteamServers: mockGetSteamServers,
  runServer: mockRunServer,
  stopServer: mockStopServer,
  autoUpdateServer: jest.fn().mockResolvedValue({
    success: true,
    stage: "complete",
    updated: false,
  }),
  backupServerSave: jest.fn().mockResolvedValue({ success: true }),
  selectBackupFolder: jest
    .fn()
    .mockResolvedValue({ success: true, path: null }),
  getServerConfig: jest.fn().mockResolvedValue({ success: true }),
  getServerOutput: jest.fn().mockResolvedValue(""),
  saveServerConfig: jest.fn().mockResolvedValue({ success: true }),
  openFileDefault: jest.fn().mockResolvedValue({ success: true }),
  getSettings: mockGetSettings,
  saveSettings: mockSaveSettings,
  checkForAppUpdate: jest.fn().mockResolvedValue({ success: true }),
  installAppUpdate: jest.fn().mockResolvedValue({ success: true }),
  onAppUpdateStatus: jest.fn(() => () => undefined),
  windowControls: {
    minimize: jest.fn().mockResolvedValue({ success: true }),
    toggleMaximize: jest
      .fn()
      .mockResolvedValue({ success: true, maximized: true }),
    close: jest.fn().mockResolvedValue({ success: true }),
  },
};

Object.defineProperty(window, "electron", {
  value: mockElectronApi,
  writable: true,
});

const runningServer = {
  name: "Running Server",
  appId: 43,
  installPath: "/path/43",
  isRunning: true,
};

describe("App auto-restart integration", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockGetSteamPaths.mockResolvedValue(["/steam"]);
    mockGetSteamServers.mockResolvedValue({
      success: true,
      servers: [runningServer],
    });
    mockGetSettings.mockResolvedValue({
      success: true,
      settings: {
        servers: {
          "43": { autoRestart: true, autoUpdate: false },
        },
      },
    });
    mockSaveSettings.mockResolvedValue({ success: true });
    mockRunServer.mockResolvedValue({ success: true });
    mockStopServer.mockResolvedValue({ success: true });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("clears auto-restart before stop so an intentional stop does not trigger runServer", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    render(<App />);

    await screen.findByText("Stop Server");
    expect(screen.getByLabelText("Auto-restart if crashed")).toBeChecked();

    await user.click(screen.getByText("Stop Server"));

    await waitFor(() => {
      expect(mockSaveSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          servers: {
            "43": expect.objectContaining({ autoRestart: false }),
          },
        })
      );
    });

    await waitFor(() => {
      expect(mockStopServer).toHaveBeenCalledWith(43, "/path/43");
    });

    // After stop clears auto-restart, a subsequent poll that shows stopped
    // must not call runServer (intentional stop, not a crash).
    mockGetSteamServers.mockResolvedValue({
      success: true,
      servers: [{ ...runningServer, isRunning: false }],
    });

    await waitFor(() => {
      expect(
        screen.getByLabelText("Auto-restart if crashed")
      ).not.toBeChecked();
    });

    await jest.advanceTimersByTimeAsync(10000);
    await waitFor(() => {
      expect(mockGetSteamServers.mock.calls.length).toBeGreaterThan(1);
    });

    expect(mockRunServer).not.toHaveBeenCalled();
  });
});
