import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SteamCmdPathInput } from "../../renderer/SteamCmdPathInput";
import type { ElectronAPI } from "../../types/ipc";

const mockSelectSteamCmdPath = jest.fn();
const mockOnChange = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  Object.defineProperty(window, "electron", {
    value: {
      selectSteamCmdPath: mockSelectSteamCmdPath,
    } as unknown as ElectronAPI,
    writable: true,
  });
});

describe("SteamCmdPathInput", () => {
  it("renders a Browse button next to the path field", () => {
    render(<SteamCmdPathInput value="" onChange={mockOnChange} />);

    expect(screen.getByLabelText("SteamCMD Path:")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Browse" })).toBeInTheDocument();
  });

  it("persists the path chosen via Browse", async () => {
    const user = userEvent.setup();
    mockSelectSteamCmdPath.mockResolvedValue({
      success: true,
      path: "C:\\steamcmd\\steamcmd.exe",
    });

    render(<SteamCmdPathInput value="" onChange={mockOnChange} />);
    await user.click(screen.getByRole("button", { name: "Browse" }));

    await waitFor(() => {
      expect(mockSelectSteamCmdPath).toHaveBeenCalled();
      expect(mockOnChange).toHaveBeenCalledWith("C:\\steamcmd\\steamcmd.exe");
    });
    expect(screen.getByLabelText("SteamCMD Path:")).toHaveValue(
      "C:\\steamcmd\\steamcmd.exe"
    );
  });

  it("leaves the value unchanged when Browse is canceled", async () => {
    const user = userEvent.setup();
    mockSelectSteamCmdPath.mockResolvedValue({
      success: false,
      path: null,
    });

    render(
      <SteamCmdPathInput value="/usr/bin/steamcmd" onChange={mockOnChange} />
    );
    await user.click(screen.getByRole("button", { name: "Browse" }));

    await waitFor(() => {
      expect(mockSelectSteamCmdPath).toHaveBeenCalled();
    });
    expect(mockOnChange).not.toHaveBeenCalled();
    expect(screen.getByLabelText("SteamCMD Path:")).toHaveValue(
      "/usr/bin/steamcmd"
    );
  });

  it("still persists typed paths on blur", () => {
    render(<SteamCmdPathInput value="" onChange={mockOnChange} />);
    const input = screen.getByLabelText("SteamCMD Path:");
    fireEvent.change(input, { target: { value: "/usr/bin/steamcmd" } });
    fireEvent.blur(input);

    expect(mockOnChange).toHaveBeenCalledWith("/usr/bin/steamcmd");
  });
});
