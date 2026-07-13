import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import App from "../../renderer/App";
import type { ElectronAPI } from "../../types/ipc";

// Mock the typed electron API exposed by the preload script
const mockGetSteamPaths = jest.fn();
const mockGetSteamServers = jest.fn();
const mockRunServer = jest.fn();
const mockStopServer = jest.fn();
const mockAutoUpdateServer = jest.fn();
const mockBackupServerSave = jest.fn();
const mockSelectBackupFolder = jest.fn();
const mockGetServerConfig = jest.fn();
const mockSaveServerConfig = jest.fn();
const mockOpenFileDefault = jest.fn();
const mockGetSettings = jest.fn();
const mockSaveSettings = jest.fn();
const mockGetAppVersion = jest.fn().mockResolvedValue("0.0.0-test");

const mockElectronApi: ElectronAPI = {
  getAppVersion: mockGetAppVersion,
  checkDiagnostics: jest.fn().mockResolvedValue({}),
  getSteamPaths: mockGetSteamPaths,
  getSteamServers: mockGetSteamServers,
  runServer: mockRunServer,
  stopServer: mockStopServer,
  autoUpdateServer: mockAutoUpdateServer,
  backupServerSave: mockBackupServerSave,
  selectBackupFolder: mockSelectBackupFolder,
  getServerConfig: mockGetServerConfig,
  getServerOutput: jest.fn().mockResolvedValue(""),
  saveServerConfig: mockSaveServerConfig,
  openFileDefault: mockOpenFileDefault,
  getSettings: mockGetSettings,
  saveSettings: mockSaveSettings,
  checkForAppUpdate: jest.fn().mockResolvedValue({ success: true }),
  installAppUpdate: jest.fn().mockResolvedValue({ success: true }),
  onAppUpdateStatus: jest.fn(() => () => undefined),
  getPalworldRestStatus: jest
    .fn()
    .mockResolvedValue({ success: true, enabled: false, isPalworld: false }),
  palworldRestRequest: jest.fn().mockResolvedValue({ success: true, data: {} }),
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

const originalConsoleError = console.error;

/** Render App and flush mount-time async path/settings/version updates. */
async function renderApp(): Promise<void> {
  await act(async () => {
    render(<App />);
    await Promise.resolve();
  });

  await waitFor(() => {
    expect(mockGetSteamPaths).toHaveBeenCalled();
    expect(mockGetSettings).toHaveBeenCalled();
    expect(mockGetAppVersion).toHaveBeenCalled();
    expect(mockGetSteamServers).toHaveBeenCalled();
  });
  await screen.findByLabelText("App version");
  await screen.findByRole("option", { name: "C:\\Program Files\\Steam" });

  await act(async () => {
    const pending = mockGetSteamServers.mock.results
      .filter((result) => result.type === "return")
      .map((result) =>
        Promise.resolve(result.value as Promise<unknown>).catch(() => undefined)
      );
    await Promise.all(pending);
    await Promise.resolve();
    await Promise.resolve();
  });
}

/** Extra flush after interactions that trigger more async IPC. */
async function flushAsync(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
  });
}

describe("App Component", () => {
  beforeAll(() => {
    // React 18 + async useEffect IPC: setState after await can still trip the
    // act() warning even when the update is flushed under act/waitFor.
    console.error = (...args: unknown[]): void => {
      const first = args[0];
      if (typeof first === "string" && first.includes("not wrapped in act")) {
        return;
      }
      originalConsoleError(...args);
    };
  });

  afterAll(() => {
    console.error = originalConsoleError;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSteamPaths.mockResolvedValue([
      "C:\\Program Files\\Steam",
      "D:\\SteamLibrary",
    ]);
    mockGetSteamServers.mockResolvedValue({
      success: true,
      servers: [],
    });
    mockGetSettings.mockResolvedValue({
      success: true,
      settings: { servers: {} },
    });
    mockSaveSettings.mockResolvedValue({ success: true });
  });

  it("should render the title", async () => {
    await renderApp();
    const title = await screen.findByRole("heading", {
      name: "Steam Server Manager",
    });
    expect(title).toBeInTheDocument();
    await flushAsync();
  });

  it("should display servers when fetched successfully", async () => {
    const mockServers = [
      {
        name: "Valheim Server",
        appId: 1396110,
        installPath: "/path/to/valheim",
        isRunning: true,
      },
      {
        name: "Ark Server",
        appId: 376030,
        installPath: "/path/to/ark",
        isRunning: false,
      },
    ];

    mockGetSteamServers.mockResolvedValue({
      success: true,
      servers: mockServers,
    });

    await renderApp();

    await waitFor(() => {
      expect(screen.getByText("Valheim Server")).toBeInTheDocument();
      expect(screen.getByText("Ark Server")).toBeInTheDocument();
    });
    await flushAsync();
  });

  it("should display correct server count", async () => {
    const mockServers = [
      {
        name: "Server 1",
        appId: 1,
        installPath: "/path/1",
        isRunning: true,
      },
      {
        name: "Server 2",
        appId: 2,
        installPath: "/path/2",
        isRunning: false,
      },
      {
        name: "Server 3",
        appId: 3,
        installPath: "/path/3",
        isRunning: true,
      },
    ];

    mockGetSteamServers.mockResolvedValue({
      success: true,
      servers: mockServers,
    });

    await renderApp();

    await waitFor(() => {
      expect(screen.getByText("Found 3 servers")).toBeInTheDocument();
    });
    await flushAsync();
  });

  it("should display error message when fetch fails", async () => {
    const errorMessage = "Failed to detect Steam servers";
    mockGetSteamServers.mockResolvedValue({
      success: false,
      servers: [],
      error: errorMessage,
    });

    await renderApp();

    await waitFor(() => {
      expect(screen.getByText(`⚠️ ${errorMessage}`)).toBeInTheDocument();
    });
    await flushAsync();
  });

  it("should display error message when exception is thrown", async () => {
    mockGetSteamServers.mockRejectedValue(new Error("Network error"));

    await renderApp();

    await waitFor(() => {
      expect(screen.getByText("⚠️ Network error")).toBeInTheDocument();
    });
    await flushAsync();
  });

  it("should handle unknown errors gracefully", async () => {
    mockGetSteamServers.mockRejectedValue("Unknown error");

    await renderApp();

    await waitFor(() => {
      expect(
        screen.getByText("⚠️ An unexpected error occurred")
      ).toBeInTheDocument();
    });
    await flushAsync();
  });

  it("should display server running status", async () => {
    const mockServers = [
      {
        name: "Running Server",
        appId: 1,
        installPath: "/path/1",
        isRunning: true,
      },
      {
        name: "Stopped Server",
        appId: 2,
        installPath: "/path/2",
        isRunning: false,
      },
    ];

    mockGetSteamServers.mockResolvedValue({
      success: true,
      servers: mockServers,
    });

    await renderApp();

    await waitFor(() => {
      const runningElement = screen.getByText("Running");
      const stoppedElement = screen.getByText("Stopped");
      expect(runningElement).toBeInTheDocument();
      expect(stoppedElement).toBeInTheDocument();
    });
    await flushAsync();
  });

  it("should display server details correctly", async () => {
    const mockServers = [
      {
        name: "Test Server",
        appId: 12345,
        installPath: "/path/to/server",
        isRunning: true,
      },
    ];

    mockGetSteamServers.mockResolvedValue({
      success: true,
      servers: mockServers,
    });

    await renderApp();

    await waitFor(() => {
      expect(screen.getByText("12345")).toBeInTheDocument();
      expect(screen.getByText("/path/to/server")).toBeInTheDocument();
    });
    await flushAsync();
  });

  it("should call fetchServers when retry button is clicked", async () => {
    const user = userEvent.setup();
    mockGetSteamServers.mockResolvedValue({
      success: false,
      servers: [],
      error: "Test error",
    });

    await renderApp();

    await waitFor(() => {
      expect(screen.getByText("Retry")).toBeInTheDocument();
    });
    await flushAsync();

    const retryButton = screen.getByText("Retry");
    await user.click(retryButton);

    // Once for the mount fetch, once for the retry
    expect(mockGetSteamServers).toHaveBeenCalledTimes(2);
    await flushAsync();
  });

  it("should call runServer via the typed API when Run Server is clicked", async () => {
    const user = userEvent.setup();
    mockGetSteamServers.mockResolvedValue({
      success: true,
      servers: [
        {
          name: "Stopped Server",
          appId: 42,
          installPath: "/path/42",
          isRunning: false,
        },
      ],
    });
    mockRunServer.mockResolvedValue({ success: true });

    await renderApp();

    await waitFor(() => {
      expect(screen.getByText("Run Server")).toBeInTheDocument();
    });
    await flushAsync();

    await user.click(screen.getByText("Run Server"));

    await waitFor(() => {
      expect(mockRunServer).toHaveBeenCalledWith(42, "/path/42");
    });
    await flushAsync();
  });

  it("should call stopServer via the typed API when Stop Server is clicked", async () => {
    const user = userEvent.setup();
    mockGetSteamServers.mockResolvedValue({
      success: true,
      servers: [
        {
          name: "Running Server",
          appId: 43,
          installPath: "/path/43",
          isRunning: true,
        },
      ],
    });
    mockStopServer.mockResolvedValue({ success: true });

    await renderApp();

    await waitFor(() => {
      expect(screen.getByText("Stop Server")).toBeInTheDocument();
    });
    await flushAsync();

    await user.click(screen.getByText("Stop Server"));

    await waitFor(() => {
      expect(mockStopServer).toHaveBeenCalledWith(43, "/path/43");
    });
    await flushAsync();
  });

  it("should handle singular and plural server text", async () => {
    const mockServers = [
      {
        name: "Only Server",
        appId: 1,
        installPath: "/path/1",
        isRunning: true,
      },
    ];

    mockGetSteamServers.mockResolvedValue({
      success: true,
      servers: mockServers,
    });

    await renderApp();

    await waitFor(() => {
      expect(screen.getByText("Found 1 server")).toBeInTheDocument();
    });
    await flushAsync();
  });

  it("should list all Steam library paths and refetch on selection", async () => {
    const user = userEvent.setup();

    await renderApp();
    await flushAsync();

    const selector = screen.getByLabelText("Steam Library:");
    expect(
      screen.getByRole("option", { name: "C:\\Program Files\\Steam" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "D:\\SteamLibrary" })
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(mockGetSteamServers).toHaveBeenCalledWith(
        "C:\\Program Files\\Steam"
      );
    });

    await user.selectOptions(selector, "D:\\SteamLibrary");

    await waitFor(() => {
      expect(mockGetSteamServers).toHaveBeenCalledWith("D:\\SteamLibrary");
    });
    await flushAsync();
  });

  it("should persist the selected Steam library path", async () => {
    const user = userEvent.setup();

    await renderApp();
    await flushAsync();

    const selector = screen.getByLabelText("Steam Library:");
    await user.selectOptions(selector, "D:\\SteamLibrary");

    await waitFor(() => {
      expect(mockSaveSettings).toHaveBeenCalledWith(
        expect.objectContaining({ selectedSteamPath: "D:\\SteamLibrary" })
      );
    });
    await flushAsync();
  });

  it("should persist the steamcmd path entered in settings", async () => {
    await renderApp();
    await flushAsync();

    const input = screen.getByLabelText("SteamCMD Path:");
    fireEvent.change(input, { target: { value: "/usr/bin/steamcmd" } });
    fireEvent.blur(input);

    await waitFor(() => {
      expect(mockSaveSettings).toHaveBeenCalledWith(
        expect.objectContaining({ steamCmdPath: "/usr/bin/steamcmd" })
      );
    });
    await flushAsync();
  });

  it("should show the persisted steamcmd path", async () => {
    mockGetSettings.mockResolvedValue({
      success: true,
      settings: { steamCmdPath: "C:\\steamcmd\\steamcmd.exe", servers: {} },
    });

    await renderApp();
    await flushAsync();

    const input = screen.getByLabelText("SteamCMD Path:");
    await waitFor(() => {
      expect(input).toHaveValue("C:\\steamcmd\\steamcmd.exe");
    });
  });

  it("should render app container", async () => {
    await renderApp();
    const appContainer = await screen.findByRole("heading", {
      name: "Steam Server Manager",
    });
    expect(appContainer.closest(".container")).toBeInTheDocument();
    await flushAsync();
  });

  it("should render detected servers text", async () => {
    await renderApp();
    expect(
      await screen.findByText("Detected Steam Dedicated Servers")
    ).toBeInTheDocument();
    await flushAsync();
  });
});
