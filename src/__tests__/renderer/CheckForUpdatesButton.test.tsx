import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import CheckForUpdatesButton from "../../renderer/CheckForUpdatesButton";
import type { ElectronAPI, ManualUpdateCheckResult } from "../../types/ipc";

const mockCheckForAppUpdate = jest.fn();

const mockElectronApi = {
  checkForAppUpdate: mockCheckForAppUpdate,
} as unknown as ElectronAPI;

Object.defineProperty(window, "electron", {
  value: mockElectronApi,
  writable: true,
});

function resolveCheckWith(result: ManualUpdateCheckResult): void {
  mockCheckForAppUpdate.mockResolvedValue(result);
}

describe("CheckForUpdatesButton", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resolveCheckWith({ outcome: "up-to-date" });
  });

  it("renders a Check for updates button with no status message", () => {
    render(<CheckForUpdatesButton />);
    expect(
      screen.getByRole("button", { name: "Check for updates" })
    ).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows an immediate checking message and disables the button", async () => {
    const user = userEvent.setup();
    let resolveCheck: (result: ManualUpdateCheckResult) => void = () => {};
    mockCheckForAppUpdate.mockReturnValue(
      new Promise<ManualUpdateCheckResult>((resolve) => {
        resolveCheck = resolve;
      })
    );
    render(<CheckForUpdatesButton />);

    const button = screen.getByRole("button", { name: "Check for updates" });
    await user.click(button);

    expect(screen.getByRole("status")).toHaveTextContent(
      "Checking for updates…"
    );
    expect(button).toBeDisabled();

    act(() => {
      resolveCheck({ outcome: "up-to-date" });
    });
    await waitFor(() => {
      expect(button).toBeEnabled();
    });
  });

  it("reports up-to-date with an ok tone", async () => {
    const user = userEvent.setup();
    resolveCheckWith({ outcome: "up-to-date" });
    render(<CheckForUpdatesButton />);

    await user.click(screen.getByRole("button", { name: "Check for updates" }));

    const status = await screen.findByText(
      "No updates found — you're on the latest version."
    );
    expect(status).toHaveClass("update-check-status-ok");
  });

  it("reports a found update with its version", async () => {
    const user = userEvent.setup();
    resolveCheckWith({ outcome: "update-available", version: "9.9.9" });
    render(<CheckForUpdatesButton />);

    await user.click(screen.getByRole("button", { name: "Check for updates" }));

    expect(await screen.findByText("Update found: v9.9.9")).toBeInTheDocument();
  });

  it("reports the disabled state with a pending tone", async () => {
    const user = userEvent.setup();
    resolveCheckWith({ outcome: "disabled" });
    render(<CheckForUpdatesButton />);

    await user.click(screen.getByRole("button", { name: "Check for updates" }));

    const status = await screen.findByText(
      "Update checks are only available in installed builds."
    );
    expect(status).toHaveClass("update-check-status-pending");
  });

  it("reports a busy updater without pretending success", async () => {
    const user = userEvent.setup();
    resolveCheckWith({ outcome: "busy", message: "Downloading update…" });
    render(<CheckForUpdatesButton />);

    await user.click(screen.getByRole("button", { name: "Check for updates" }));

    expect(await screen.findByText("Downloading update…")).toBeInTheDocument();
  });

  it("reports structured errors with a failed tone", async () => {
    const user = userEvent.setup();
    resolveCheckWith({ outcome: "error", message: "GitHub unreachable" });
    render(<CheckForUpdatesButton />);

    await user.click(screen.getByRole("button", { name: "Check for updates" }));

    const status = await screen.findByText(
      "Update check failed: GitHub unreachable"
    );
    expect(status).toHaveClass("update-check-status-failed");
  });

  it("survives a rejected IPC call and re-enables the button", async () => {
    const user = userEvent.setup();
    mockCheckForAppUpdate.mockRejectedValue(new Error("ipc broke"));
    render(<CheckForUpdatesButton />);

    const button = screen.getByRole("button", { name: "Check for updates" });
    await user.click(button);

    expect(
      await screen.findByText("Update check failed: ipc broke")
    ).toBeInTheDocument();
    expect(button).toBeEnabled();
  });
});
