import { act, fireEvent, render, screen, within } from "@testing-library/react";

import { QueryOpsPanel } from "../../renderer/QueryOpsPanel";
import type {
  GameQueryInfo,
  GameQuerySnapshotResponse,
  SteamServer,
} from "../../types/ipc";

type SnapshotFn = (
  appId: number,
  installPath: string
) => Promise<GameQuerySnapshotResponse>;

const enshrouded: SteamServer = {
  name: "Enshrouded Dedicated Server",
  appId: 2278520,
  installPath: "C:\\servers\\enshrouded",
  isRunning: true,
  capabilities: ["rest_admin", "live_ops", "update_announce"],
  opsProtocol: "query",
  adminConfigKey: "userGroups",
};

const healthyInfo: GameQueryInfo = {
  serverName: "Embervale Keep",
  map: "Embervale",
  game: "Enshrouded",
  version: "0.7.4.1",
  players: 3,
  maxPlayers: 16,
  bots: 0,
  passwordProtected: true,
};

const healthySnapshot: GameQuerySnapshotResponse = {
  success: true,
  host: "127.0.0.1",
  port: 15637,
  info: healthyInfo,
  players: [
    { name: "Ash", score: 0, durationSeconds: 125 },
    { name: "", score: 0, durationSeconds: 40 },
    { name: "Briar", score: 2, durationSeconds: 3700 },
  ],
};

let snapshotMock: jest.Mock<ReturnType<SnapshotFn>, Parameters<SnapshotFn>>;

function installSnapshot(
  impl: SnapshotFn = () => Promise.resolve(healthySnapshot)
): void {
  snapshotMock = jest.fn(impl);
  Object.defineProperty(window, "electron", {
    value: { getGameQuerySnapshot: snapshotMock },
    configurable: true,
  });
}

interface RenderOptions {
  server?: SteamServer;
  opsEnabled?: boolean;
  opsIntervalSeconds?: number;
  onToggleOps?: (enabled: boolean) => void;
  onChangeInterval?: (seconds: number) => void;
}

function panel(options: RenderOptions = {}): JSX.Element {
  return (
    <QueryOpsPanel
      server={options.server ?? enshrouded}
      opsEnabled={options.opsEnabled ?? true}
      opsIntervalSeconds={options.opsIntervalSeconds ?? 5}
      onToggleOps={options.onToggleOps ?? ((): void => undefined)}
      onChangeInterval={options.onChangeInterval ?? ((): void => undefined)}
    />
  );
}

/** Value text of the live-ops row whose key label is `key`. */
function liveValue(key: string): string | null {
  const live = screen.getByTestId("query-ops-live");
  const keyCell = within(live).getByText(key, {
    selector: ".palworld-ops-key",
  });
  return keyCell.nextElementSibling?.textContent ?? null;
}

async function flushPromises(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function advance(ms: number): Promise<void> {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
}

describe("QueryOpsPanel", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    installSnapshot();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("renders enabled toggle and interval controls even while the server is stopped", () => {
    render(
      panel({
        server: { ...enshrouded, isRunning: false },
        opsEnabled: false,
        opsIntervalSeconds: 15,
      })
    );

    const toggle = screen.getByLabelText("Live ops panel");
    const select = screen.getByLabelText("Poll every");
    expect(screen.getByTestId("query-ops-panel")).toBeInTheDocument();
    expect(toggle).toBeEnabled();
    expect(toggle).not.toBeChecked();
    expect(select).toBeEnabled();
    expect(select).toHaveValue("15");
    expect(
      within(select)
        .getAllByRole("option")
        .map((option) => option.textContent)
    ).toEqual(["2s", "5s", "10s", "15s", "30s", "60s"]);
  });

  it("forwards toggle and interval changes to the callbacks", () => {
    const toggles: boolean[] = [];
    const intervals: number[] = [];
    render(
      panel({
        opsEnabled: false,
        onToggleOps: (enabled) => toggles.push(enabled),
        onChangeInterval: (seconds) => intervals.push(seconds),
      })
    );

    fireEvent.click(screen.getByLabelText("Live ops panel"));
    fireEvent.change(screen.getByLabelText("Poll every"), {
      target: { value: "30" },
    });

    expect(toggles).toEqual([true]);
    expect(intervals).toEqual([30]);
  });

  it("does not query or show live status when the toggle is off", async () => {
    render(panel({ opsEnabled: false }));

    await advance(60_000);

    expect(snapshotMock).not.toHaveBeenCalled();
    expect(screen.queryByTestId("query-ops-live")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Start the server to see live status.")
    ).not.toBeInTheDocument();
  });

  it("does not query when the server is stopped and hints to start it", async () => {
    render(panel({ server: { ...enshrouded, isRunning: false } }));

    await advance(60_000);

    expect(snapshotMock).not.toHaveBeenCalled();
    expect(screen.queryByTestId("query-ops-live")).not.toBeInTheDocument();
    expect(
      screen.getByText("Start the server to see live status.")
    ).toBeInTheDocument();
  });

  it("queries immediately and renders server info and named players", async () => {
    render(panel());
    await flushPromises();

    expect(snapshotMock).toHaveBeenCalledTimes(1);
    expect(snapshotMock).toHaveBeenCalledWith(
      2278520,
      "C:\\servers\\enshrouded"
    );
    expect(liveValue("status")).toMatch(/^polling@5s · .+/);
    expect(liveValue("server")).toBe("Embervale Keep");
    expect(liveValue("reported version")).toBe("0.7.4.1");
    expect(
      within(screen.getByTestId("query-ops-live")).getByText(
        "reported version",
        { selector: ".palworld-ops-key" }
      )
    ).toHaveAttribute(
      "title",
      expect.stringContaining("not necessarily the game version")
    );
    // Not labelled as the game version: Enshrouded 1.0 reports "0.0.15.0".
    expect(
      within(screen.getByTestId("query-ops-live")).queryByText("version", {
        selector: ".palworld-ops-key",
      })
    ).toBeNull();
    expect(liveValue("players")).toBe("3/16 · Ash, Briar");
    expect(
      screen.queryByText("Start the server to see live status.")
    ).not.toBeInTheDocument();
    expect(screen.queryByText("error")).not.toBeInTheDocument();
  });

  it("polls again on every interval tick", async () => {
    render(panel({ opsIntervalSeconds: 10 }));
    await flushPromises();
    expect(snapshotMock).toHaveBeenCalledTimes(1);

    await advance(9_999);
    expect(snapshotMock).toHaveBeenCalledTimes(1);

    await advance(1);
    expect(snapshotMock).toHaveBeenCalledTimes(2);

    await advance(10_000);
    expect(snapshotMock).toHaveBeenCalledTimes(3);
    expect(liveValue("status")).toMatch(/^polling@10s · /);
  });

  it("skips interval ticks while a slow query is still in flight", async () => {
    let finish: (() => void) | undefined;
    installSnapshot(
      () =>
        new Promise((resolve) => {
          finish = () => resolve(healthySnapshot);
        })
    );
    render(panel({ opsIntervalSeconds: 2 }));
    await flushPromises();
    expect(snapshotMock).toHaveBeenCalledTimes(1);

    // A down server can take several timeouts to answer; never stack queries.
    await advance(6_000);
    expect(snapshotMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      finish?.();
      await Promise.resolve();
    });
    expect(liveValue("server")).toBe("Embervale Keep");

    await advance(2_000);
    expect(snapshotMock).toHaveBeenCalledTimes(2);
  });

  it("clamps the interval before polling", async () => {
    render(panel({ opsIntervalSeconds: 1 }));
    await flushPromises();

    expect(screen.getByLabelText("Poll every")).toHaveValue("2");
    expect(liveValue("status")).toMatch(/^polling@2s/);

    await advance(2_000);
    expect(snapshotMock).toHaveBeenCalledTimes(2);
  });

  it("shows a dash for the server-reported version and only the count when no names are reported", async () => {
    installSnapshot(() =>
      Promise.resolve({
        ...healthySnapshot,
        info: { ...healthyInfo, version: "", players: 1 },
        players: [{ name: "", score: 0, durationSeconds: 12 }],
      })
    );
    render(panel());
    await flushPromises();

    expect(liveValue("reported version")).toBe("—");
    expect(liveValue("players")).toBe("1/16");
  });

  it("renders the query error and dashes when the snapshot fails", async () => {
    installSnapshot(() =>
      Promise.resolve({
        success: false,
        errorKind: "timeout",
        error: "No response from 127.0.0.1:15637 within 2000 ms",
        host: "127.0.0.1",
        port: 15637,
      })
    );
    render(panel());
    await flushPromises();

    expect(liveValue("error")).toBe(
      "timeout — No response from 127.0.0.1:15637 within 2000 ms"
    );
    expect(liveValue("server")).toBe("—");
    expect(liveValue("reported version")).toBe("—");
    expect(liveValue("players")).toBe("—");
  });

  it("renders a player-list error while still showing the info", async () => {
    installSnapshot(() =>
      Promise.resolve({
        ...healthySnapshot,
        players: null,
        playersError: "timeout — player list did not answer",
      })
    );
    render(panel());
    await flushPromises();

    expect(liveValue("players")).toBe("3/16");
    expect(liveValue("player list")).toBe(
      "timeout — player list did not answer"
    );
    expect(screen.queryByText("error")).not.toBeInTheDocument();
  });

  it("renders the message when the query call itself rejects", async () => {
    installSnapshot(() => Promise.reject(new Error("IPC channel closed")));
    render(panel());
    await flushPromises();

    expect(liveValue("error")).toBe("IPC channel closed");
  });

  it("stops polling after unmount", async () => {
    const { unmount } = render(panel());
    await flushPromises();
    expect(snapshotMock).toHaveBeenCalledTimes(1);

    unmount();
    await advance(60_000);

    expect(snapshotMock).toHaveBeenCalledTimes(1);
  });

  it("stops polling and hides live status when toggled off", async () => {
    const { rerender } = render(panel());
    await flushPromises();
    expect(screen.getByTestId("query-ops-live")).toBeInTheDocument();

    rerender(panel({ opsEnabled: false }));
    await advance(60_000);

    expect(snapshotMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("query-ops-live")).not.toBeInTheDocument();
  });

  it("ignores a result that arrives after polling was gated off", async () => {
    let resolveFirst: (value: GameQuerySnapshotResponse) => void = () =>
      undefined;
    installSnapshot(
      () =>
        new Promise<GameQuerySnapshotResponse>((resolve) => {
          resolveFirst = resolve;
        })
    );
    const { rerender } = render(panel());

    rerender(panel({ server: { ...enshrouded, isRunning: false } }));
    await act(async () => {
      resolveFirst(healthySnapshot);
      await Promise.resolve();
    });

    snapshotMock.mockImplementation(
      () => new Promise<GameQuerySnapshotResponse>(() => undefined)
    );
    rerender(panel());
    await flushPromises();

    expect(snapshotMock).toHaveBeenCalledTimes(2);
    expect(liveValue("server")).toBe("—");
    expect(liveValue("status")).toBe("polling@5s");
  });

  it("clears the previous snapshot when polling is gated off", async () => {
    const { rerender } = render(panel());
    await flushPromises();
    expect(liveValue("server")).toBe("Embervale Keep");

    rerender(panel({ opsEnabled: false }));
    snapshotMock.mockImplementation(
      () => new Promise<GameQuerySnapshotResponse>(() => undefined)
    );
    rerender(panel());
    await flushPromises();

    expect(snapshotMock).toHaveBeenCalledTimes(2);
    expect(liveValue("server")).toBe("—");
    expect(liveValue("players")).toBe("—");
  });

  it("never mentions Palworld or REST in its copy", async () => {
    const { container, rerender } = render(panel());
    await flushPromises();
    expect(container.textContent).not.toMatch(/Palworld|\bREST\b/);

    rerender(panel({ server: { ...enshrouded, isRunning: false } }));
    expect(container.textContent).toContain(
      "Start the server to see live status."
    );
    expect(container.textContent).not.toMatch(/Palworld|\bREST\b/);
  });
});
