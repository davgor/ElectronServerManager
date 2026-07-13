import { render, screen, waitFor } from "@testing-library/react";

import TitleBar from "../../renderer/TitleBar";
import type { ElectronAPI } from "../../types/ipc";

const mockGetAppVersion = jest.fn();

const mockElectronApi = {
  getAppVersion: mockGetAppVersion,
  windowControls: {
    minimize: jest.fn().mockResolvedValue({ success: true }),
    toggleMaximize: jest
      .fn()
      .mockResolvedValue({ success: true, maximized: false }),
    close: jest.fn().mockResolvedValue({ success: true }),
  },
} as unknown as ElectronAPI;

Object.defineProperty(window, "electron", {
  value: mockElectronApi,
  writable: true,
});

describe("TitleBar", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("loads and displays the app version from window.electron.getAppVersion", async () => {
    mockGetAppVersion.mockResolvedValue("1.0.19");

    render(<TitleBar />);

    expect(mockGetAppVersion).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("v1.0.19")).toBeInTheDocument();
  });

  it("hides the version label when getAppVersion fails", async () => {
    mockGetAppVersion.mockRejectedValue(new Error("ipc down"));

    render(<TitleBar />);

    await waitFor(() => {
      expect(mockGetAppVersion).toHaveBeenCalled();
    });

    expect(screen.queryByText(/^v/)).not.toBeInTheDocument();
  });
});
