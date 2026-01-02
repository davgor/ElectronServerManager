/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call */

import * as childProcess from "child_process";

import { isProcessRunning } from "../../main/steamDetection";

jest.mock("child_process", () => ({
  execSync: jest.fn(),
}));

describe("isProcessRunning", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it("returns true on Windows when tasklist contains exe name", (): void => {
    const original = Object.getOwnPropertyDescriptor(process, "platform");
    if (original) {
      Object.defineProperty(process, "platform", { value: "win32", configurable: true });
    }

    // Return a Buffer similar to execSync on Windows
    const mockedExec = jest.mocked(childProcess.execSync);
    const windowsBuffer = Buffer.from("process.exe\n") as unknown as ReturnType<typeof childProcess.execSync>;
    mockedExec.mockReturnValueOnce(windowsBuffer);

    const result = isProcessRunning("process.exe");

    expect(result).toBe(true);

    if (original) {
      Object.defineProperty(process, "platform", original);
    }
  });

  it("returns false on non-windows when pgrep throws", (): void => {
    const original = Object.getOwnPropertyDescriptor(process, "platform");
    if (original) {
      Object.defineProperty(process, "platform", { value: "linux", configurable: true });
    }

    const mockedExec2 = jest.mocked(childProcess.execSync);
    mockedExec2.mockImplementationOnce(() => {
      throw new Error("not found");
    });

    const result = isProcessRunning("someproc");

    expect(result).toBe(false);

    if (original) {
      Object.defineProperty(process, "platform", original);
    }
  });
});
