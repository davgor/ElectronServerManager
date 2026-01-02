import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import App from "../../renderer/App";

// Mock the electron API
const mockInvoke = jest.fn();

Object.defineProperty(window, "electron", {
  value: {
    ipcRenderer: {
      invoke: mockInvoke,
    },
  },
  writable: true,
});

describe("App Component", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockInvoke.mockImplementation((channel) => {
      if (channel === "get-steam-paths") {
        return Promise.resolve([
          "C:\\Program Files\\Steam",
          "D:\\SteamLibrary",
        ]);
      }
      // Default response for "get-steam-servers"
      return Promise.resolve({
        success: true,
        servers: [],
      });
    });
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

    mockInvoke.mockImplementation((channel) => {
      if (channel === "get-steam-paths") {
        return Promise.resolve([
          "C:\\Program Files\\Steam",
          "D:\\SteamLibrary",
        ]);
      }
      return Promise.resolve({
        success: true,
        servers: mockServers,
      });
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

    mockInvoke.mockImplementation((channel) => {
      if (channel === "get-steam-paths") {
        return Promise.resolve([
          "C:\\Program Files\\Steam",
          "D:\\SteamLibrary",
        ]);
      }
      return Promise.resolve({
        success: true,
        servers: mockServers,
      });
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Found 3 servers")).toBeInTheDocument();
    });
  });

  it("should display error message when fetch fails", async () => {
    const errorMessage = "Failed to detect Steam servers";
    mockInvoke.mockImplementation((channel) => {
      if (channel === "get-steam-paths") {
        return Promise.resolve([
          "C:\\Program Files\\Steam",
          "D:\\SteamLibrary",
        ]);
      }
      return Promise.resolve({
        success: false,
        servers: [],
        error: errorMessage,
      });
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(`⚠️ ${errorMessage}`)).toBeInTheDocument();
    });
  });

  it("should display error message when exception is thrown", async () => {
    mockInvoke.mockImplementation((channel) => {
      if (channel === "get-steam-paths") {
        return Promise.resolve([
          "C:\\Program Files\\Steam",
          "D:\\SteamLibrary",
        ]);
      }
      return Promise.reject(new Error("Network error"));
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("⚠️ Network error")).toBeInTheDocument();
    });
  });

  it("should handle unknown errors gracefully", async () => {
    mockInvoke.mockImplementation((channel) => {
      if (channel === "get-steam-paths") {
        return Promise.resolve([
          "C:\\Program Files\\Steam",
          "D:\\SteamLibrary",
        ]);
      }
      return Promise.reject("Unknown error");
    });

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

    mockInvoke.mockImplementation((channel) => {
      if (channel === "get-steam-paths") {
        return Promise.resolve([
          "C:\\Program Files\\Steam",
          "D:\\SteamLibrary",
        ]);
      }
      return Promise.resolve({
        success: true,
        servers: mockServers,
      });
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

    mockInvoke.mockImplementation((channel) => {
      if (channel === "get-steam-paths") {
        return Promise.resolve([
          "C:\\Program Files\\Steam",
          "D:\\SteamLibrary",
        ]);
      }
      return Promise.resolve({
        success: true,
        servers: mockServers,
      });
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("12345")).toBeInTheDocument();
      expect(screen.getByText("/path/to/server")).toBeInTheDocument();
    });
  });

  it("should call fetchServers when retry button is clicked", async () => {
    const user = userEvent.setup();
    mockInvoke.mockImplementation((channel) => {
      if (channel === "get-steam-paths") {
        return Promise.resolve([
          "C:\\Program Files\\Steam",
          "D:\\SteamLibrary",
        ]);
      }
      return Promise.resolve({
        success: false,
        servers: [],
        error: "Test error",
      });
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Retry")).toBeInTheDocument();
    });

    const retryButton = screen.getByText("Retry");
    await user.click(retryButton);

    // First call for get-steam-paths on mount, second for get-steam-servers on mount, third for get-steam-servers on retry
    expect(mockInvoke).toHaveBeenCalledTimes(3);
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

    mockInvoke.mockImplementation((channel) => {
      if (channel === "get-steam-paths") {
        return Promise.resolve([
          "C:\\Program Files\\Steam",
          "D:\\SteamLibrary",
        ]);
      }
      return Promise.resolve({
        success: true,
        servers: mockServers,
      });
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Found 1 server")).toBeInTheDocument();
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
