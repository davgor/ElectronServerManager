/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/strict-boolean-expressions */

const handleMock = jest.fn();

jest.mock("electron", () => ({
  ipcMain: {
    handle: (...args: unknown[]) => handleMock(...args),
  },
  BrowserWindow: jest.fn(),
}));

import { registerWindowControlHandlers } from "../../main/windowControls";

type Handler = () => unknown;

function getHandler(channel: string): Handler {
  const call = handleMock.mock.calls.find(
    (entry: unknown[]) => entry[0] === channel
  ) as [string, Handler] | undefined;
  if (call === undefined) {
    throw new Error(`Handler not registered for ${channel}`);
  }
  return call[1];
}

describe("windowControls", () => {
  beforeEach(() => {
    handleMock.mockReset();
  });

  it("registers minimize, maximize-toggle, and close handlers", () => {
    registerWindowControlHandlers(() => null);

    expect(handleMock).toHaveBeenCalledWith(
      "window-minimize",
      expect.any(Function)
    );
    expect(handleMock).toHaveBeenCalledWith(
      "window-maximize-toggle",
      expect.any(Function)
    );
    expect(handleMock).toHaveBeenCalledWith(
      "window-close",
      expect.any(Function)
    );
  });

  it("returns an error when the main window is unavailable", () => {
    registerWindowControlHandlers(() => null);

    expect(getHandler("window-minimize")()).toEqual({
      success: false,
      error: "Main window not available",
    });
    expect(getHandler("window-maximize-toggle")()).toEqual({
      success: false,
      error: "Main window not available",
    });
    expect(getHandler("window-close")()).toEqual({
      success: false,
      error: "Main window not available",
    });
  });

  it("minimizes, toggles maximize, and closes when a window exists", () => {
    const windowMock = {
      minimize: jest.fn(),
      isMaximized: jest.fn().mockReturnValue(false),
      maximize: jest.fn(),
      unmaximize: jest.fn(),
      close: jest.fn(),
    };
    registerWindowControlHandlers(() => windowMock as never);

    expect(getHandler("window-minimize")()).toEqual({ success: true });
    expect(windowMock.minimize).toHaveBeenCalled();

    expect(getHandler("window-maximize-toggle")()).toEqual({
      success: true,
      maximized: false,
    });
    expect(windowMock.maximize).toHaveBeenCalled();

    windowMock.isMaximized.mockReturnValue(true);
    expect(getHandler("window-maximize-toggle")()).toEqual({
      success: true,
      maximized: true,
    });
    expect(windowMock.unmaximize).toHaveBeenCalled();

    expect(getHandler("window-close")()).toEqual({ success: true });
    expect(windowMock.close).toHaveBeenCalled();
  });
});
