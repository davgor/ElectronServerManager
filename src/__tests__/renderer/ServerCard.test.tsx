import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ServerCard } from "../../renderer/ServerCard";
import type { ServerCardProps } from "../../renderer/ServerCard";
import type { SteamServer } from "../../types/ipc";

const baseServer: SteamServer = {
  name: "Valheim Server",
  appId: 1396110,
  installPath: "C:\\servers\\valheim",
  isRunning: false,
};

function makeProps(overrides: Partial<ServerCardProps> = {}): ServerCardProps {
  return {
    server: baseServer,
    autoRestartEnabled: false,
    autoUpdateEnabled: false,
    backupPath: undefined,
    backupIntervalSeconds: 3600,
    lastBackup: undefined,
    palworldOpsEnabled: false,
    palworldOpsIntervalSeconds: undefined,
    configRevision: 0,
    onRunServer: jest.fn(),
    onStopServer: jest.fn(),
    onToggleAutoRestart: jest.fn(),
    onToggleAutoUpdate: jest.fn(),
    onSelectBackupFolder: jest.fn(),
    onChangeBackupInterval: jest.fn(),
    onBackupNow: jest.fn(),
    onEditConfig: jest.fn(),
    onTogglePalworldOps: jest.fn(),
    onChangePalworldOpsInterval: jest.fn(),
    ...overrides,
  };
}

function stubElectron(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  const value = {
    getServerOutput: jest.fn().mockResolvedValue(""),
    getServerMetrics: jest.fn().mockResolvedValue({
      success: true,
      running: false,
      sampleCount: 0,
    }),
    getPalworldRestStatus: jest.fn().mockResolvedValue({
      success: true,
      enabled: false,
      isPalworld: false,
    }),
    listServerMods: jest.fn().mockResolvedValue({ success: true, mods: [] }),
    ...overrides,
  };
  Object.defineProperty(window, "electron", {
    value,
    configurable: true,
  });
  return value;
}

describe("ServerCard Component", () => {
  beforeEach(() => {
    stubElectron();
  });

  it("should render the server name, app id, install path and Stopped status", () => {
    render(<ServerCard {...makeProps()} />);

    expect(screen.getByText("Valheim Server")).toBeInTheDocument();
    expect(screen.getByText("1396110")).toBeInTheDocument();
    expect(screen.getByText("C:\\servers\\valheim")).toBeInTheDocument();
    expect(screen.getByText("Stopped")).toBeInTheDocument();
    expect(screen.queryByText("Running")).not.toBeInTheDocument();
  });

  it("should render Running status when the server is running", () => {
    render(
      <ServerCard
        {...makeProps({ server: { ...baseServer, isRunning: true } })}
      />
    );

    expect(screen.getByText("Running")).toBeInTheDocument();
    expect(screen.queryByText("Stopped")).not.toBeInTheDocument();
  });

  it("should show Run Server when stopped and call onRunServer with appId and installPath", async () => {
    const user = userEvent.setup();
    const props = makeProps();
    render(<ServerCard {...props} />);

    expect(screen.queryByText("Stop Server")).not.toBeInTheDocument();

    await user.click(screen.getByText("Run Server"));

    expect(props.onRunServer).toHaveBeenCalledWith(
      1396110,
      "C:\\servers\\valheim"
    );
  });

  it("should show Stop Server when running and call onStopServer with appId and installPath", async () => {
    const user = userEvent.setup();
    const props = makeProps({ server: { ...baseServer, isRunning: true } });
    render(<ServerCard {...props} />);

    expect(screen.queryByText("Run Server")).not.toBeInTheDocument();

    await user.click(screen.getByText("Stop Server"));

    expect(props.onStopServer).toHaveBeenCalledWith(
      1396110,
      "C:\\servers\\valheim"
    );
  });

  it("should render an unchecked auto-restart checkbox and call onToggleAutoRestart(appId, true) when toggled on", async () => {
    const user = userEvent.setup();
    const props = makeProps({ autoRestartEnabled: false });
    render(<ServerCard {...props} />);

    const checkbox = screen.getByLabelText("Auto-restart if crashed");
    expect(checkbox).not.toBeChecked();

    await user.click(checkbox);

    expect(props.onToggleAutoRestart).toHaveBeenCalledWith(1396110, true);
  });

  it("should render a checked auto-restart checkbox and call onToggleAutoRestart(appId, false) when toggled off", async () => {
    const user = userEvent.setup();
    const props = makeProps({ autoRestartEnabled: true });
    render(<ServerCard {...props} />);

    const checkbox = screen.getByLabelText("Auto-restart if crashed");
    expect(checkbox).toBeChecked();

    await user.click(checkbox);

    expect(props.onToggleAutoRestart).toHaveBeenCalledWith(1396110, false);
  });

  it("should render an unchecked auto-update checkbox and call onToggleAutoUpdate(appId, true) when toggled on", async () => {
    const user = userEvent.setup();
    const props = makeProps({ autoUpdateEnabled: false });
    render(<ServerCard {...props} />);

    const checkbox = screen.getByLabelText(
      "Auto-update & restart when available"
    );
    expect(checkbox).not.toBeChecked();

    await user.click(checkbox);

    expect(props.onToggleAutoUpdate).toHaveBeenCalledWith(1396110, true);
  });

  it("should render a checked auto-update checkbox and call onToggleAutoUpdate(appId, false) when toggled off", async () => {
    const user = userEvent.setup();
    const props = makeProps({ autoUpdateEnabled: true });
    render(<ServerCard {...props} />);

    const checkbox = screen.getByLabelText(
      "Auto-update & restart when available"
    );
    expect(checkbox).toBeChecked();

    await user.click(checkbox);

    expect(props.onToggleAutoUpdate).toHaveBeenCalledWith(1396110, false);
  });

  it("should call onEditConfig with the server when Edit Config is clicked", async () => {
    const user = userEvent.setup();
    const props = makeProps();
    render(<ServerCard {...props} />);

    await user.click(screen.getByText("⚙️ Edit Config"));

    expect(props.onEditConfig).toHaveBeenCalledWith(baseServer);
  });

  it("should call onSelectBackupFolder with the appId when the backup folder button is clicked", async () => {
    const user = userEvent.setup();
    const props = makeProps();
    render(<ServerCard {...props} />);

    await user.click(screen.getByText("📁 Select Backup Folder"));

    expect(props.onSelectBackupFolder).toHaveBeenCalledWith(1396110);
  });

  it("should hide the interval select and Backup Now when no backupPath is set", () => {
    render(<ServerCard {...makeProps()} />);

    expect(screen.getByText("📁 Select Backup Folder")).toBeInTheDocument();
    expect(screen.queryByLabelText(/Interval:/)).not.toBeInTheDocument();
    expect(screen.queryByText("Backup Now")).not.toBeInTheDocument();
  });

  it("should show Change Backup Folder and the last path segment when backupPath is set", () => {
    render(
      <ServerCard {...makeProps({ backupPath: "C:\\Backups\\valheim" })} />
    );

    expect(screen.getByText("📁 Change Backup Folder")).toBeInTheDocument();
    expect(screen.getByText("valheim")).toBeInTheDocument();
  });

  it("should render the interval select with the configured value and call onChangeBackupInterval(appId, 300)", async () => {
    const user = userEvent.setup();
    const props = makeProps({
      backupPath: "C:\\Backups\\valheim",
      backupIntervalSeconds: 3600,
    });
    render(<ServerCard {...props} />);

    const select = screen.getByLabelText(/Interval:/);
    expect(select).toHaveValue("3600");

    await user.selectOptions(select, "300");

    expect(props.onChangeBackupInterval).toHaveBeenCalledWith(1396110, 300);
  });

  it("should call onBackupNow with appId and installPath when Backup Now is clicked", async () => {
    const user = userEvent.setup();
    const props = makeProps({ backupPath: "C:\\Backups\\valheim" });
    render(<ServerCard {...props} />);

    await user.click(screen.getByText("Backup Now"));

    expect(props.onBackupNow).toHaveBeenCalledWith(
      1396110,
      "C:\\servers\\valheim"
    );
  });

  it("should render the last backup time when lastBackup is provided", () => {
    render(
      <ServerCard
        {...makeProps({
          backupPath: "C:\\Backups\\valheim",
          lastBackup: "1/1/2026, 10:00:00 AM",
        })}
      />
    );

    expect(screen.getByText("Last: 1/1/2026, 10:00:00 AM")).toBeInTheDocument();
  });

  it("should not render a last backup time when lastBackup is not provided", () => {
    render(
      <ServerCard {...makeProps({ backupPath: "C:\\Backups\\valheim" })} />
    );

    expect(screen.queryByText(/Last:/)).not.toBeInTheDocument();
  });

  it("should render the cover art image when coverArt is set", () => {
    render(
      <ServerCard
        {...makeProps({
          server: { ...baseServer, coverArt: "https://example.com/cover.jpg" },
        })}
      />
    );

    const image = screen.getByAltText("Valheim Server");
    expect(image).toBeInTheDocument();
    expect(image).toHaveAttribute("src", "https://example.com/cover.jpg");
  });

  it("should not render a cover art image when coverArt is not set", () => {
    render(<ServerCard {...makeProps()} />);

    expect(screen.queryByAltText("Valheim Server")).not.toBeInTheDocument();
  });

  it("loads and shows recent server output when Show Output is clicked", async () => {
    const user = userEvent.setup();
    const electron = stubElectron({
      getServerOutput: jest.fn().mockResolvedValue("server booted\n"),
    });

    render(<ServerCard {...makeProps()} />);

    expect(screen.queryByTestId("server-output")).not.toBeInTheDocument();

    await user.click(screen.getByText("Show Output"));

    expect(electron.getServerOutput).toHaveBeenCalledWith(1396110);
    expect(await screen.findByTestId("server-output")).toHaveTextContent(
      "server booted"
    );
  });

  it("shows the metrics strip with current/avg/p95 while running", async () => {
    const getServerMetrics = jest.fn().mockResolvedValue({
      success: true,
      running: true,
      sampleCount: 5,
      cpu: { current: 42.5, average: 40.25, p95: 55 },
      memory: {
        current: 512 * 1024 * 1024,
        average: 256 * 1024 * 1024,
        p95: 1.5 * 1024 * 1024 * 1024,
      },
    });
    stubElectron({ getServerMetrics });

    render(
      <ServerCard
        {...makeProps({ server: { ...baseServer, isRunning: true } })}
      />
    );

    const strip = await screen.findByTestId("server-metrics");
    expect(getServerMetrics).toHaveBeenCalledWith(1396110);
    expect(strip).toHaveTextContent("CPU");
    expect(strip).toHaveTextContent("42.5%");
    expect(strip).toHaveTextContent("avg 40.3%");
    expect(strip).toHaveTextContent("p95 55.0%");
    expect(strip).toHaveTextContent("RAM");
    expect(strip).toHaveTextContent("512.0 MiB");
    expect(strip).toHaveTextContent("avg 256.0 MiB");
    expect(strip).toHaveTextContent("p95 1.50 GiB");
  });

  it("does not show the metrics strip or poll metrics when stopped", () => {
    const getServerMetrics = jest.fn();
    stubElectron({ getServerMetrics });

    render(<ServerCard {...makeProps()} />);

    expect(screen.queryByTestId("server-metrics")).not.toBeInTheDocument();
    expect(getServerMetrics).not.toHaveBeenCalled();
  });

  it("hides the metrics strip while running until samples exist", async () => {
    const getServerMetrics = jest.fn().mockResolvedValue({
      success: true,
      running: true,
      sampleCount: 0,
    });
    stubElectron({ getServerMetrics });

    render(
      <ServerCard
        {...makeProps({ server: { ...baseServer, isRunning: true } })}
      />
    );

    await waitFor(() => {
      expect(getServerMetrics).toHaveBeenCalledWith(1396110);
    });
    expect(screen.queryByTestId("server-metrics")).not.toBeInTheDocument();
  });

  it("keeps card actions working while the metrics strip is shown", async () => {
    const user = userEvent.setup();
    const getServerMetrics = jest.fn().mockResolvedValue({
      success: true,
      running: true,
      sampleCount: 1,
      cpu: { current: 10, average: 10, p95: 10 },
      memory: { current: 1024, average: 1024, p95: 1024 },
    });
    stubElectron({ getServerMetrics });

    const props = makeProps({ server: { ...baseServer, isRunning: true } });
    render(<ServerCard {...props} />);

    expect(await screen.findByTestId("server-metrics")).toBeInTheDocument();

    await user.click(screen.getByText("Stop Server"));
    expect(props.onStopServer).toHaveBeenCalledWith(
      1396110,
      "C:\\servers\\valheim"
    );
  });

  it("shows a disabled Admin button with tooltip when Palworld REST is off", async () => {
    stubElectron({
      getPalworldRestStatus: jest.fn().mockResolvedValue({
        success: true,
        enabled: false,
        isPalworld: true,
      }),
    });

    render(
      <ServerCard
        {...makeProps({
          server: {
            name: "Palworld Dedicated Server",
            appId: 1623730,
            installPath: "C:\\servers\\pal",
            isRunning: true,
            capabilities: ["rest_admin", "live_ops", "update_announce"],
          },
        })}
      />
    );

    const admin = await screen.findByRole("button", { name: "Admin" });
    expect(admin).toBeDisabled();
    expect(admin).toHaveAttribute(
      "title",
      "Please enable REST API from the config settings."
    );
    expect(screen.queryByRole("button", { name: "Admin" })).toBeInTheDocument();
    expect(screen.getByText("Live ops panel")).toBeInTheDocument();
  });

  it("does not show Admin on cards without rest_admin capability", () => {
    render(<ServerCard {...makeProps()} />);
    expect(
      screen.queryByRole("button", { name: "Admin" })
    ).not.toBeInTheDocument();
  });

  it("shows Mod Manager on Palworld cards and opens the modal", async () => {
    const user = userEvent.setup();
    stubElectron({
      getPalworldRestStatus: jest.fn().mockResolvedValue({
        success: true,
        enabled: false,
        isPalworld: true,
      }),
      listServerMods: jest.fn().mockResolvedValue({ success: true, mods: [] }),
    });

    render(
      <ServerCard
        {...makeProps({
          server: {
            name: "Palworld Dedicated Server",
            appId: 1623730,
            installPath: "C:\\servers\\pal",
            isRunning: false,
          },
        })}
      />
    );

    const button = await screen.findByRole("button", { name: "Mod Manager" });
    await user.click(button);
    expect(
      await screen.findByRole("heading", { name: "Mod Manager" })
    ).toBeInTheDocument();
  });

  it("does not show Mod Manager on non-Palworld cards", () => {
    render(<ServerCard {...makeProps()} />);
    expect(
      screen.queryByRole("button", { name: "Mod Manager" })
    ).not.toBeInTheDocument();
  });

  it("rechecks REST status and enables Admin when configRevision increases after save", async () => {
    const getPalworldRestStatus = jest
      .fn()
      .mockResolvedValueOnce({
        success: true,
        enabled: false,
        isPalworld: true,
      })
      .mockResolvedValueOnce({
        success: true,
        enabled: true,
        isPalworld: true,
      });

    stubElectron({ getPalworldRestStatus });

    const palworldProps = makeProps({
      server: {
        name: "Palworld Dedicated Server",
        appId: 1623730,
        installPath: "C:\\servers\\pal",
        isRunning: true,
        capabilities: ["rest_admin", "live_ops", "update_announce"],
      },
      configRevision: 0,
    });

    const { rerender } = render(<ServerCard {...palworldProps} />);

    const admin = await screen.findByRole("button", { name: "Admin" });
    expect(admin).toBeDisabled();
    expect(getPalworldRestStatus).toHaveBeenCalledTimes(1);

    act(() => {
      rerender(<ServerCard {...palworldProps} configRevision={1} />);
    });

    await waitFor(() => {
      expect(getPalworldRestStatus).toHaveBeenCalledTimes(2);
    });
    expect(await screen.findByRole("button", { name: "Admin" })).toBeEnabled();
  });

  it("disables Admin when configRevision increases and REST is turned off", async () => {
    const getPalworldRestStatus = jest
      .fn()
      .mockResolvedValueOnce({
        success: true,
        enabled: true,
        isPalworld: true,
      })
      .mockResolvedValueOnce({
        success: true,
        enabled: false,
        isPalworld: true,
      });

    stubElectron({ getPalworldRestStatus });

    const palworldProps = makeProps({
      server: {
        name: "Palworld Dedicated Server",
        appId: 1623730,
        installPath: "C:\\servers\\pal",
        isRunning: true,
        capabilities: ["rest_admin", "live_ops", "update_announce"],
      },
      configRevision: 0,
    });

    const { rerender } = render(<ServerCard {...palworldProps} />);

    expect(await screen.findByRole("button", { name: "Admin" })).toBeEnabled();

    act(() => {
      rerender(<ServerCard {...palworldProps} configRevision={1} />);
    });

    await waitFor(() => {
      expect(getPalworldRestStatus).toHaveBeenCalledTimes(2);
    });
    expect(await screen.findByRole("button", { name: "Admin" })).toBeDisabled();
  });
});
