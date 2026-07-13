import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ConfigEditor } from "../../renderer/ConfigEditor";
import type { ElectronAPI } from "../../types/ipc";

const mockGetServerConfig = jest.fn();
const mockSaveServerConfig = jest.fn();
const mockOpenFileDefault = jest.fn();

const mockElectronApi: ElectronAPI = {
  getAppVersion: jest.fn().mockResolvedValue("0.0.0-test"),
  checkDiagnostics: jest.fn().mockResolvedValue({}),
  getSteamPaths: jest.fn().mockResolvedValue([]),
  getSteamServers: jest.fn().mockResolvedValue({ success: true, servers: [] }),
  runServer: jest.fn().mockResolvedValue({ success: true }),
  stopServer: jest.fn().mockResolvedValue({ success: true }),
  autoUpdateServer: jest.fn().mockResolvedValue({ success: true }),
  backupServerSave: jest.fn().mockResolvedValue({ success: true }),
  selectBackupFolder: jest.fn().mockResolvedValue({ success: true }),
  getServerConfig: mockGetServerConfig,
  getServerOutput: jest.fn().mockResolvedValue(""),
  saveServerConfig: mockSaveServerConfig,
  openFileDefault: mockOpenFileDefault,
  getSettings: jest
    .fn()
    .mockResolvedValue({ success: true, settings: { servers: {} } }),
  saveSettings: jest.fn().mockResolvedValue({ success: true }),
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

const defaultProps = {
  appId: 2278520,
  serverName: "Enshrouded Server",
  installPath: "C:\\Games\\EnshroudedServer",
  onClose: jest.fn(),
  onSave: jest.fn(),
};

/** Minimal Enshrouded-like JSON config for type round-trip tests. */
const enshroudedLikeConfig: Record<string, unknown> = {
  name: "My Dedicated Server",
  saveInterval: 300,
  enableVoiceChat: true,
  tags: ["pve", "friendly"],
};

function mockLoadedConfig(
  content: Record<string, unknown> = enshroudedLikeConfig
): void {
  mockGetServerConfig.mockResolvedValue({
    success: true,
    content,
    format: "json",
    filePath: "C:\\Games\\EnshroudedServer\\enshrouded_server.json",
  });
}

describe("ConfigEditor", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSaveServerConfig.mockResolvedValue({ success: true });
    mockOpenFileDefault.mockResolvedValue({ success: true });
  });

  it("loads and displays config properties from getServerConfig", async () => {
    mockLoadedConfig();
    render(<ConfigEditor {...defaultProps} />);

    expect(screen.getByText("Loading configuration...")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("name")).toBeInTheDocument();
    });

    expect(mockGetServerConfig).toHaveBeenCalledWith(
      2278520,
      "C:\\Games\\EnshroudedServer"
    );
    expect(screen.getByDisplayValue("My Dedicated Server")).toBeInTheDocument();
    expect(screen.getByText("saveInterval")).toBeInTheDocument();
    expect(screen.getByText("enableVoiceChat")).toBeInTheDocument();
  });

  it("shows an error when getServerConfig fails", async () => {
    mockGetServerConfig.mockResolvedValue({
      success: false,
      error: "Config file not found",
    });
    render(<ConfigEditor {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText(/Config file not found/)).toBeInTheDocument();
    });
  });

  it("saves edited string values via saveServerConfig", async () => {
    const user = userEvent.setup();
    mockLoadedConfig();
    render(<ConfigEditor {...defaultProps} />);

    await waitFor(() => {
      expect(
        screen.getByDisplayValue("My Dedicated Server")
      ).toBeInTheDocument();
    });

    const nameInput = screen.getByDisplayValue("My Dedicated Server");
    await user.clear(nameInput);
    await user.type(nameInput, "Renamed Server");

    await user.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => {
      expect(mockSaveServerConfig).toHaveBeenCalled();
    });

    const [, , content, format] = mockSaveServerConfig.mock.calls[0] as [
      number,
      string,
      Record<string, unknown>,
      string,
    ];
    expect(format).toBe("json");
    expect(content.name).toBe("Renamed Server");
    expect(defaultProps.onSave).toHaveBeenCalled();
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it("opens the config file in the default app when Open is clicked", async () => {
    const user = userEvent.setup();
    mockLoadedConfig();
    render(<ConfigEditor {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Open" })).toBeEnabled();
    });

    await user.click(screen.getByRole("button", { name: "Open" }));

    expect(mockOpenFileDefault).toHaveBeenCalledWith(
      "C:\\Games\\EnshroudedServer\\enshrouded_server.json"
    );
  });

  it("uses stable keys so editing one array item does not remount siblings", async () => {
    const user = userEvent.setup();
    mockLoadedConfig();
    render(<ConfigEditor {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText(/tags \[Array\(2\)\]/i)).toBeInTheDocument();
    });

    await user.click(screen.getByText(/tags \[Array\(2\)\]/i));

    const firstInput = screen.getByDisplayValue("pve");
    const secondInput = screen.getByDisplayValue("friendly");

    await user.clear(firstInput);
    await user.type(firstInput, "hardcore");

    expect(screen.getByDisplayValue("friendly")).toBe(secondInput);
  });

  it("renders booleans as checkboxes and numbers as number inputs, preserving types on save", async () => {
    const user = userEvent.setup();
    mockLoadedConfig();
    render(<ConfigEditor {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByLabelText("enableVoiceChat")).toBeInTheDocument();
    });

    const voiceCheckbox = screen.getByLabelText("enableVoiceChat");
    expect(voiceCheckbox).toHaveAttribute("type", "checkbox");
    expect(voiceCheckbox).toBeChecked();

    const intervalInput = screen.getByLabelText("saveInterval");
    expect(intervalInput).toHaveAttribute("type", "number");
    expect(intervalInput).toHaveValue(300);

    await user.click(voiceCheckbox);
    await user.clear(intervalInput);
    await user.type(intervalInput, "600");

    await user.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => {
      expect(mockSaveServerConfig).toHaveBeenCalled();
    });

    const [, , content] = mockSaveServerConfig.mock.calls[0] as [
      number,
      string,
      Record<string, unknown>,
      string,
    ];
    expect(content.enableVoiceChat).toBe(false);
    expect(typeof content.enableVoiceChat).toBe("boolean");
    expect(content.saveInterval).toBe(600);
    expect(typeof content.saveInterval).toBe("number");
  });

  it("deletes a nested property and persists the deletion on save", async () => {
    const user = userEvent.setup();
    mockLoadedConfig({
      gameSettings: {
        playerHealthFactor: 1,
        enableDurability: true,
      },
    });
    render(<ConfigEditor {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText("gameSettings")).toBeInTheDocument();
    });

    await user.click(screen.getByText("gameSettings"));

    expect(screen.getByText("enableDurability")).toBeInTheDocument();

    const durabilityRow = screen
      .getByText("enableDurability")
      .closest(".property-item") as HTMLElement;
    await user.click(
      within(durabilityRow).getByRole("button", { name: /delete/i })
    );

    expect(screen.queryByText("enableDurability")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => {
      expect(mockSaveServerConfig).toHaveBeenCalled();
    });

    const [, , content] = mockSaveServerConfig.mock.calls[0] as [
      number,
      string,
      { gameSettings: Record<string, unknown> },
      string,
    ];
    expect(content.gameSettings.enableDurability).toBeUndefined();
    expect(content.gameSettings.playerHealthFactor).toBe(1);
  });

  it("confirms before deleting a top-level property", async () => {
    const user = userEvent.setup();
    const confirmSpy = jest.spyOn(window, "confirm").mockReturnValue(true);
    mockLoadedConfig({ name: "Server", port: 15636 });
    render(<ConfigEditor {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText("port")).toBeInTheDocument();
    });

    const portRow = screen
      .getByText("port")
      .closest(".property-item") as HTMLElement;
    await user.click(within(portRow).getByRole("button", { name: /delete/i }));

    expect(confirmSpy).toHaveBeenCalled();
    expect(screen.queryByText("port")).not.toBeInTheDocument();

    confirmSpy.mockRestore();
  });

  it("filters the property tree by key and auto-expands nested matches", async () => {
    const user = userEvent.setup();
    mockLoadedConfig({
      name: "My Dedicated Server",
      userGroups: {
        admin: { password: "secret", canKickBan: true },
        guest: { password: "guest", canKickBan: false },
      },
    });
    render(<ConfigEditor {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText("name")).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText("Search settings"), "canKickBan");

    expect(screen.queryByText("name")).not.toBeInTheDocument();
    expect(screen.getByText("userGroups")).toBeInTheDocument();
    expect(screen.getAllByText("canKickBan").length).toBeGreaterThanOrEqual(1);
  });

  it("filters by value match", async () => {
    const user = userEvent.setup();
    mockLoadedConfig({
      name: "My Dedicated Server",
      saveInterval: 300,
    });
    render(<ConfigEditor {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText("saveInterval")).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText("Search settings"), "Dedicated");

    expect(screen.getByText("name")).toBeInTheDocument();
    expect(screen.queryByText("saveInterval")).not.toBeInTheDocument();
  });

  it("clears search and restores the full property tree", async () => {
    const user = userEvent.setup();
    mockLoadedConfig();
    render(<ConfigEditor {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText("name")).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText("Search settings"), "saveInterval");
    expect(screen.queryByText("name")).not.toBeInTheDocument();
    expect(screen.getByText("saveInterval")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Clear search" }));

    expect(screen.getByText("name")).toBeInTheDocument();
    expect(screen.getByText("saveInterval")).toBeInTheDocument();
    expect(screen.getByLabelText("Search settings")).toHaveValue("");
  });

  it("shows an empty state when no settings match the query", async () => {
    const user = userEvent.setup();
    mockLoadedConfig();
    render(<ConfigEditor {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByLabelText("Search settings")).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText("Search settings"), "zzzz-no-match");

    expect(
      screen.getByText('No settings match "zzzz-no-match"')
    ).toBeInTheDocument();
  });
});
