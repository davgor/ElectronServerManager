import { render, screen, waitFor } from "@testing-library/react";
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

describe("ServerCard Component", () => {
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
    const getServerOutput = jest.fn().mockResolvedValue("server booted\n");
    Object.defineProperty(window, "electron", {
      value: { getServerOutput },
      configurable: true,
    });

    render(<ServerCard {...makeProps()} />);

    expect(screen.queryByTestId("server-output")).not.toBeInTheDocument();

    await user.click(screen.getByText("Show Output"));

    expect(getServerOutput).toHaveBeenCalledWith(1396110);
    expect(await screen.findByTestId("server-output")).toHaveTextContent(
      "server booted"
    );
  });

  it("shows a disabled Admin button with tooltip when Palworld REST is off", async () => {
    Object.defineProperty(window, "electron", {
      value: {
        getPalworldRestStatus: jest.fn().mockResolvedValue({
          success: true,
          enabled: false,
          isPalworld: true,
        }),
      },
      configurable: true,
    });

    render(
      <ServerCard
        {...makeProps({
          server: {
            name: "Palworld Dedicated Server",
            appId: 1623730,
            installPath: "C:\\servers\\pal",
            isRunning: true,
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

  it("does not show Admin on non-Palworld cards", () => {
    render(<ServerCard {...makeProps()} />);
    expect(
      screen.queryByRole("button", { name: "Admin" })
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

    Object.defineProperty(window, "electron", {
      value: { getPalworldRestStatus },
      configurable: true,
    });

    const palworldProps = makeProps({
      server: {
        name: "Palworld Dedicated Server",
        appId: 1623730,
        installPath: "C:\\servers\\pal",
        isRunning: true,
      },
      configRevision: 0,
    });

    const { rerender } = render(<ServerCard {...palworldProps} />);

    const admin = await screen.findByRole("button", { name: "Admin" });
    expect(admin).toBeDisabled();
    expect(getPalworldRestStatus).toHaveBeenCalledTimes(1);

    rerender(<ServerCard {...palworldProps} configRevision={1} />);

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

    Object.defineProperty(window, "electron", {
      value: { getPalworldRestStatus },
      configurable: true,
    });

    const palworldProps = makeProps({
      server: {
        name: "Palworld Dedicated Server",
        appId: 1623730,
        installPath: "C:\\servers\\pal",
        isRunning: true,
      },
      configRevision: 0,
    });

    const { rerender } = render(<ServerCard {...palworldProps} />);

    expect(await screen.findByRole("button", { name: "Admin" })).toBeEnabled();

    rerender(<ServerCard {...palworldProps} configRevision={1} />);

    await waitFor(() => {
      expect(getPalworldRestStatus).toHaveBeenCalledTimes(2);
    });
    expect(await screen.findByRole("button", { name: "Admin" })).toBeDisabled();
  });
});
