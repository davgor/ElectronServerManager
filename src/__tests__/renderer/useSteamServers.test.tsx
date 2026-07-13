import { act, renderHook } from "@testing-library/react";

import { useSteamServers } from "../../renderer/hooks/useSteamServers";
import type { ElectronAPI, SteamServer } from "../../types/ipc";

const mockGetSteamPaths = jest.fn();
const mockGetSteamServers = jest.fn();
const mockRunServer = jest.fn();
const mockAutoUpdateServer = jest.fn();

const mockElectronApi = {
  getSteamPaths: mockGetSteamPaths,
  getSteamServers: mockGetSteamServers,
  runServer: mockRunServer,
  autoUpdateServer: mockAutoUpdateServer,
} as unknown as ElectronAPI;

Object.defineProperty(window, "electron", {
  value: mockElectronApi,
  writable: true,
});

const runningServer: SteamServer = {
  name: "Valheim Server",
  appId: 1396110,
  installPath: "/servers/valheim",
  isRunning: true,
};

const stoppedServer: SteamServer = {
  ...runningServer,
  isRunning: false,
};

/** Flush pending microtasks (promise chains) inside act. */
async function flushPromises(times = 4): Promise<void> {
  for (let i = 0; i < times; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

/** Advance fake timers and flush the resulting promise chains. */
async function advanceTime(ms: number): Promise<void> {
  await act(async () => {
    jest.advanceTimersByTime(ms);
    await Promise.resolve();
  });
  await flushPromises();
}

describe("useSteamServers", () => {
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    mockGetSteamPaths.mockResolvedValue(["/steam"]);
    mockGetSteamServers.mockResolvedValue({ success: true, servers: [] });
    mockRunServer.mockResolvedValue({ success: true });
    mockAutoUpdateServer.mockResolvedValue({ success: true });
  });

  afterEach(() => {
    jest.useRealTimers();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("fetches paths, auto-selects the first path, fetches servers, and transitions loading true -> false", async () => {
    mockGetSteamPaths.mockResolvedValue(["/steam", "/other"]);
    mockGetSteamServers.mockResolvedValue({
      success: true,
      servers: [runningServer],
    });

    const { result } = renderHook(() => useSteamServers());

    expect(result.current.loading).toBe(true);

    await flushPromises();

    expect(mockGetSteamPaths).toHaveBeenCalledTimes(1);
    expect(result.current.availablePaths).toEqual(["/steam", "/other"]);
    expect(result.current.selectedPath).toBe("/steam");
    expect(mockGetSteamServers).toHaveBeenCalledWith("/steam");
    expect(result.current.servers).toEqual([runningServer]);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("selects preferredPath instead of the first path when it is in the list", async () => {
    mockGetSteamPaths.mockResolvedValue(["/steam", "/library"]);

    const { result } = renderHook(() =>
      useSteamServers({ preferredPath: "/library" })
    );

    await flushPromises();

    expect(result.current.selectedPath).toBe("/library");
    expect(mockGetSteamServers).toHaveBeenCalledWith("/library");
  });

  it("adopts a preferredPath that arrives later when the user has not chosen a path", async () => {
    mockGetSteamPaths.mockResolvedValue(["/steam", "/library"]);

    const { result, rerender } = renderHook(
      ({ preferredPath }: { preferredPath?: string }) =>
        useSteamServers({ preferredPath }),
      {
        initialProps: { preferredPath: undefined } as {
          preferredPath?: string;
        },
      }
    );

    await flushPromises();
    expect(result.current.selectedPath).toBe("/steam");

    rerender({ preferredPath: "/library" });
    await flushPromises();

    expect(result.current.selectedPath).toBe("/library");
  });

  it("polls servers on the interval without setting loading during background polls", async () => {
    mockGetSteamServers.mockResolvedValue({
      success: true,
      servers: [runningServer],
    });

    const { result } = renderHook(() => useSteamServers());
    await flushPromises();

    expect(mockGetSteamServers).toHaveBeenCalledTimes(1);
    expect(result.current.loading).toBe(false);

    // Make the next poll hang so we can observe loading mid-flight.
    let resolvePoll:
      | ((value: { success: boolean; servers: SteamServer[] }) => void)
      | undefined;
    mockGetSteamServers.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePoll = resolve;
        })
    );

    await act(async () => {
      jest.advanceTimersByTime(10000);
      await Promise.resolve();
    });

    expect(mockGetSteamServers).toHaveBeenCalledTimes(2);
    expect(result.current.loading).toBe(false);

    await act(async () => {
      resolvePoll?.({ success: true, servers: [runningServer] });
      await Promise.resolve();
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.servers).toEqual([runningServer]);
  });

  it("sets error on fetch failure, keeps polling, and clears error on a later success", async () => {
    mockGetSteamServers.mockResolvedValueOnce({
      success: false,
      servers: [],
      error: "Steam library unreadable",
    });

    const { result } = renderHook(() => useSteamServers());
    await flushPromises();

    expect(result.current.error).toBe("Steam library unreadable");
    expect(result.current.loading).toBe(false);

    mockGetSteamServers.mockResolvedValue({
      success: true,
      servers: [stoppedServer],
    });

    await advanceTime(10000);

    expect(mockGetSteamServers).toHaveBeenCalledTimes(2);
    expect(result.current.error).toBeNull();
    expect(result.current.servers).toEqual([stoppedServer]);
  });

  it("uses the thrown Error message on unexpected failures", async () => {
    mockGetSteamServers.mockRejectedValueOnce(new Error("IPC exploded"));

    const { result } = renderHook(() => useSteamServers());
    await flushPromises();

    expect(result.current.error).toBe("IPC exploded");
  });

  it("restarts a crashed server exactly once when auto-restart is enabled", async () => {
    mockGetSteamServers
      .mockResolvedValueOnce({ success: true, servers: [runningServer] })
      .mockResolvedValue({ success: true, servers: [stoppedServer] });

    renderHook(() =>
      useSteamServers({ autoRestartAppIds: new Set([runningServer.appId]) })
    );
    await flushPromises();

    expect(mockRunServer).not.toHaveBeenCalled();

    // Server crashed between polls -> exactly one restart.
    await advanceTime(10000);

    expect(mockRunServer).toHaveBeenCalledTimes(1);
    expect(mockRunServer).toHaveBeenCalledWith(
      runningServer.appId,
      runningServer.installPath
    );

    // Still stopped on the next poll -> no second restart.
    await advanceTime(10000);

    expect(mockRunServer).toHaveBeenCalledTimes(1);
  });

  it("does not restart a crashed server when auto-restart is not enabled for it", async () => {
    mockGetSteamServers
      .mockResolvedValueOnce({ success: true, servers: [runningServer] })
      .mockResolvedValue({ success: true, servers: [stoppedServer] });

    renderHook(() => useSteamServers({ autoRestartAppIds: new Set([999]) }));
    await flushPromises();

    await advanceTime(10000);

    expect(mockRunServer).not.toHaveBeenCalled();
  });

  it("does not restart after autoRestartAppIds is cleared (intentional stop)", async () => {
    mockGetSteamServers
      .mockResolvedValueOnce({ success: true, servers: [runningServer] })
      .mockResolvedValue({ success: true, servers: [stoppedServer] });

    const { rerender } = renderHook(
      ({ ids }: { ids: ReadonlySet<number> }) =>
        useSteamServers({ autoRestartAppIds: ids }),
      {
        initialProps: {
          ids: new Set([runningServer.appId]) as ReadonlySet<number>,
        },
      }
    );
    await flushPromises();

    // Simulate App clearing auto-restart before stop.
    rerender({ ids: new Set() });
    await advanceTime(10000);

    expect(mockRunServer).not.toHaveBeenCalled();
  });

  it("surfaces an error when the auto-restart fails", async () => {
    mockGetSteamServers
      .mockResolvedValueOnce({ success: true, servers: [runningServer] })
      .mockResolvedValue({ success: true, servers: [stoppedServer] });
    mockRunServer.mockResolvedValue({ success: false, error: "no exe" });

    const { result } = renderHook(() =>
      useSteamServers({ autoRestartAppIds: new Set([runningServer.appId]) })
    );
    await flushPromises();

    await advanceTime(10000);

    expect(result.current.error).toBe(
      `Failed to auto-restart ${runningServer.name}: no exe`
    );
  });

  it("triggers auto-update once and respects the 5-minute cooldown", async () => {
    mockGetSteamServers.mockResolvedValue({
      success: true,
      servers: [runningServer],
    });

    renderHook(() =>
      useSteamServers({ autoUpdateAppIds: new Set([runningServer.appId]) })
    );
    await flushPromises();

    expect(mockAutoUpdateServer).toHaveBeenCalledTimes(1);
    expect(mockAutoUpdateServer).toHaveBeenCalledWith(
      runningServer.appId,
      runningServer.installPath,
      "/steam"
    );

    // Two more polls, both well within the 5-minute cooldown.
    await advanceTime(10000);
    await advanceTime(10000);

    expect(mockAutoUpdateServer).toHaveBeenCalledTimes(1);
  });

  it("does not auto-update servers that are not running", async () => {
    mockGetSteamServers.mockResolvedValue({
      success: true,
      servers: [stoppedServer],
    });

    renderHook(() =>
      useSteamServers({ autoUpdateAppIds: new Set([stoppedServer.appId]) })
    );
    await flushPromises();

    expect(mockAutoUpdateServer).not.toHaveBeenCalled();
  });

  it("fetches servers for a new path when setSelectedPath is called", async () => {
    mockGetSteamPaths.mockResolvedValue(["/steam", "/library"]);

    const { result } = renderHook(() => useSteamServers());
    await flushPromises();

    expect(mockGetSteamServers).toHaveBeenLastCalledWith("/steam");

    act(() => {
      result.current.setSelectedPath("/library");
    });
    await flushPromises();

    expect(result.current.selectedPath).toBe("/library");
    expect(mockGetSteamServers).toHaveBeenLastCalledWith("/library");
  });

  it("re-fetches on demand via refresh with loading set", async () => {
    const { result } = renderHook(() => useSteamServers());
    await flushPromises();

    expect(mockGetSteamServers).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.refresh();
    });

    expect(mockGetSteamServers).toHaveBeenCalledTimes(2);
    expect(result.current.loading).toBe(false);
  });

  it("keeps refresh and setSelectedPath identities stable across renders", async () => {
    const { result, rerender } = renderHook(() => useSteamServers());
    await flushPromises();

    const firstRefresh = result.current.refresh;
    const firstSetSelectedPath = result.current.setSelectedPath;

    rerender();

    expect(result.current.refresh).toBe(firstRefresh);
    expect(result.current.setSelectedPath).toBe(firstSetSelectedPath);
  });
});
