import { render, screen, waitFor } from "@testing-library/react";
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

const mockElectronApi: ElectronAPI = {
  getAppVersion: jest.fn().mockResolvedValue("0.0.0-test"),
  checkDiagnostics: jest.fn().mockResolvedValue({}),
  getSteamPaths: mockGetSteamPaths,
  getSteamServers: mockGetSteamServers,
  runServer: mockRunServer,
  stopServer: mockStopServer,
  autoUpdateServer: mockAutoUpdateServer,
  backupServerSave: mockBackupServerSave,
  selectBackupFolder: mockSelectBackupFolder,
  getServerConfig: mockGetServerConfig,
  saveServerConfig: mockSaveServerConfig,
  openFileDefault: mockOpenFileDefault,
  getSettings: mockGetSettings,
  saveSettings: mockSaveSettings,
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

describe("App Component", () => {
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

  it("should render the title", () => {
    render(<App />);
    const title = screen.getByRole("heading", { name: "Steam Server Manager" });
    expect(title).toBeInTheDocument();
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

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Valheim Server")).toBeInTheDocument();
      expect(screen.getByText("Ark Server")).toBeInTheDocument();
    });
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

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Found 3 servers")).toBeInTheDocument();
    });
  });

  it("should display error message when fetch fails", async () => {
    const errorMessage = "Failed to detect Steam servers";
    mockGetSteamServers.mockResolvedValue({
      success: false,
      servers: [],
      error: errorMessage,
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(`⚠️ ${errorMessage}`)).toBeInTheDocument();
    });
  });

  it("should display error message when exception is thrown", async () => {
    mockGetSteamServers.mockRejectedValue(new Error("Network error"));

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("⚠️ Network error")).toBeInTheDocument();
    });
  });

  it("should handle unknown errors gracefully", async () => {
    mockGetSteamServers.mockRejectedValue("Unknown error");

    render(<App />);

    await waitFor(() => {
      expect(
        screen.getByText("⚠️ An unexpected error occurred")
      ).toBeInTheDocument();
    });
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

    render(<App />);

    await waitFor(() => {
      const runningElement = screen.getByText("Running");
      const stoppedElement = screen.getByText("Stopped");
      expect(runningElement).toBeInTheDocument();
      expect(stoppedElement).toBeInTheDocument();
    });
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

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("12345")).toBeInTheDocument();
      expect(screen.getByText("/path/to/server")).toBeInTheDocument();
    });
  });

  it("should call fetchServers when retry button is clicked", async () => {
    const user = userEvent.setup();
    mockGetSteamServers.mockResolvedValue({
      success: false,
      servers: [],
      error: "Test error",
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Retry")).toBeInTheDocument();
    });

    const retryButton = screen.getByText("Retry");
    await user.click(retryButton);

    // Once for the mount fetch, once for the retry
    expect(mockGetSteamServers).toHaveBeenCalledTimes(2);
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

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Run Server")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Run Server"));

    await waitFor(() => {
      expect(mockRunServer).toHaveBeenCalledWith(42, "/path/42");
    });
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

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Stop Server")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Stop Server"));

    await waitFor(() => {
      expect(mockStopServer).toHaveBeenCalledWith(43, "/path/43");
    });
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

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Found 1 server")).toBeInTheDocument();
    });
  });

  it("should list all Steam library paths and refetch on selection", async () => {
    const user = userEvent.setup();

    render(<App />);

    const selector = await screen.findByLabelText("Steam Library:");
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
  });

  it("should persist the selected Steam library path", async () => {
    const user = userEvent.setup();

    render(<App />);

    const selector = await screen.findByLabelText("Steam Library:");
    await user.selectOptions(selector, "D:\\SteamLibrary");

    await waitFor(() => {
      expect(mockSaveSettings).toHaveBeenCalledWith(
        expect.objectContaining({ selectedSteamPath: "D:\\SteamLibrary" })
      );
    });
  });

  it("should render app container", () => {
    render(<App />);
    const appContainer = screen.getByRole("heading", {
      name: "Steam Server Manager",
    });
    expect(appContainer.closest(".container")).toBeInTheDocument();
  });

  it("should render detected servers text", () => {
    render(<App />);
    expect(
      screen.getByText("Detected Steam Dedicated Servers")
    ).toBeInTheDocument();
  });
});
