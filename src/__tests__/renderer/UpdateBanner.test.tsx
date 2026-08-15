import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import UpdateBanner from "../../renderer/UpdateBanner";
import type { AppUpdateStatus, ElectronAPI } from "../../types/ipc";

let statusListener: ((status: AppUpdateStatus) => void) | null = null;
const mockInstallAppUpdate = jest.fn();

const mockElectronApi = {
  installAppUpdate: mockInstallAppUpdate,
  onAppUpdateStatus: (callback: (status: AppUpdateStatus) => void) => {
    statusListener = callback;
    return () => {
      statusListener = null;
    };
  },
} as unknown as ElectronAPI;

Object.defineProperty(window, "electron", {
  value: mockElectronApi,
  writable: true,
});

function emit(status: AppUpdateStatus): void {
  act(() => {
    statusListener?.(status);
  });
}

describe("UpdateBanner", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    statusListener = null;
    mockInstallAppUpdate.mockResolvedValue({ success: true });
  });

  it("renders nothing while idle", () => {
    const { container } = render(<UpdateBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows from → to versions when an update is available", () => {
    render(<UpdateBanner />);
    emit({
      state: "available",
      version: "1.0.2",
      currentVersion: "1.0.1",
    });
    expect(
      screen.getByText("Update available: v1.0.1 → v1.0.2")
    ).toBeInTheDocument();
  });

  it("shows download progress percent", () => {
    render(<UpdateBanner />);
    emit({ state: "downloading", percent: 63.4 });
    expect(screen.getByText("Downloading update… 63%")).toBeInTheDocument();
  });

  it("lets the user restart to install a ready update", async () => {
    const user = userEvent.setup();
    render(<UpdateBanner />);
    emit({ state: "ready", version: "1.0.3" });

    expect(
      screen.getByText("Update v1.0.3 ready — restart and update to apply")
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Restart and update" })
    );

    await waitFor(() => {
      expect(mockInstallAppUpdate).toHaveBeenCalledTimes(1);
    });
  });

  it("shows install failures without crashing", async () => {
    const user = userEvent.setup();
    mockInstallAppUpdate.mockResolvedValue({
      success: false,
      error: "quit failed",
    });
    render(<UpdateBanner />);
    emit({ state: "ready", version: "1.0.3" });

    await user.click(
      screen.getByRole("button", { name: "Restart and update" })
    );

    expect(await screen.findByText("quit failed")).toBeInTheDocument();
  });

  it("clears a stale install error once a new update cycle starts", async () => {
    const user = userEvent.setup();
    mockInstallAppUpdate.mockResolvedValue({
      success: false,
      error: "quit failed",
    });
    render(<UpdateBanner />);
    emit({ state: "ready", version: "1.0.3" });

    await user.click(
      screen.getByRole("button", { name: "Restart and update" })
    );
    expect(await screen.findByText("quit failed")).toBeInTheDocument();

    // A fresh (non-error) status from main invalidates the old install error.
    emit({ state: "downloading", percent: 10 });
    emit({ state: "ready", version: "1.0.4" });

    expect(screen.queryByText("quit failed")).not.toBeInTheDocument();
  });

  it("shows updater errors from main", () => {
    render(<UpdateBanner />);
    emit({ state: "error", message: "GitHub unreachable" });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Update error: GitHub unreachable"
    );
  });
});
