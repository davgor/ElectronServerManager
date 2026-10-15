import { act, fireEvent, render, screen, within } from "@testing-library/react";

import { QueryAdminModal } from "../../renderer/QueryAdminModal";
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

const info: GameQueryInfo = {
  serverName: "Embervale Keep",
  map: "Embervale",
  game: "Enshrouded",
  version: "0.7.4.1",
  players: 3,
  maxPlayers: 16,
  bots: 0,
  passwordProtected: true,
};

const populated: GameQuerySnapshotResponse = {
  success: true,
  host: "127.0.0.1",
  port: 15637,
  info,
  players: [
    { name: "Ash", score: 0, durationSeconds: 125 },
    { name: "", score: 0, durationSeconds: 40 },
    { name: "Briar", score: 2, durationSeconds: 3700 },
  ],
};

const UNSUPPORTED_TITLE =
  "Not supported remotely by Enshrouded Dedicated Server";

let snapshotMock: jest.Mock<ReturnType<SnapshotFn>, Parameters<SnapshotFn>>;

function installSnapshot(
  impl: SnapshotFn = () => Promise.resolve(populated)
): void {
  snapshotMock = jest.fn(impl);
  Object.defineProperty(window, "electron", {
    value: { getGameQuerySnapshot: snapshotMock },
    configurable: true,
  });
}

interface Calls {
  close: number;
  stop: number;
  roles: number;
}

function renderModal(
  options: { server?: SteamServer; withRoles?: boolean } = {}
): Calls {
  const calls: Calls = { close: 0, stop: 0, roles: 0 };
  render(
    <QueryAdminModal
      server={options.server ?? enshrouded}
      onClose={() => {
        calls.close += 1;
      }}
      onStopServer={() => {
        calls.stop += 1;
      }}
      onEditRoles={
        options.withRoles === false
          ? undefined
          : (): void => {
              calls.roles += 1;
            }
      }
    />
  );
  return calls;
}

/** Text of the `<dd>` paired with the `<dt>` labelled `label`. */
function fact(label: string): string | null {
  const term = screen.getByText(label, { selector: "dt" });
  return term.nextElementSibling?.textContent ?? null;
}

function section(heading: string): HTMLElement {
  const title = screen.getByRole("heading", { name: heading });
  const container = title.closest("section");
  if (container === null) {
    throw new Error(`No section for heading ${heading}`);
  }
  return container;
}

describe("QueryAdminModal", () => {
  let confirmSpy: jest.SpyInstance<boolean, [message?: string]>;

  beforeEach(() => {
    installSnapshot();
    confirmSpy = jest.spyOn(window, "confirm").mockReturnValue(false);
  });

  afterEach(() => {
    confirmSpy.mockRestore();
  });

  it("renders an accessible dialog titled Server Admin and closes from the header", async () => {
    const calls = renderModal();

    const dialog = screen.getByRole("dialog", { name: "Server Admin" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(
      within(dialog).getByText("Enshrouded Dedicated Server")
    ).toBeInTheDocument();
    await screen.findByText("Embervale Keep");

    fireEvent.click(screen.getByRole("button", { name: "Close admin modal" }));

    expect(calls.close).toBe(1);
    expect(calls.stop).toBe(0);
  });

  it("fetches one snapshot on open and renders live status and players", async () => {
    renderModal();

    expect(await screen.findByText("Embervale Keep")).toBeInTheDocument();
    expect(snapshotMock).toHaveBeenCalledTimes(1);
    expect(snapshotMock).toHaveBeenCalledWith(
      2278520,
      "C:\\servers\\enshrouded"
    );
    expect(fact("Address")).toBe("127.0.0.1:15637");
    expect(fact("Server name")).toBe("Embervale Keep");
    expect(fact("Server-reported version")).toBe("0.7.4.1");
    expect(
      screen.getByText("Server-reported version", { selector: "dt" })
    ).toHaveAttribute(
      "title",
      expect.stringContaining("not necessarily the game version")
    );
    expect(screen.queryByText("Version", { selector: "dt" })).toBeNull();
    expect(fact("Players")).toBe("3/16");
    expect(fact("Password protected")).toBe("Yes");

    const rows = within(screen.getByRole("list", { name: "Players online" }))
      .getAllByRole("listitem")
      .map((row) => row.textContent);
    expect(rows).toEqual([
      "Ash2m 05s",
      "(name not reported)40s",
      "Briar1h 01m",
    ]);
  });

  it("shows No players online and password No for an empty open server", async () => {
    installSnapshot(() =>
      Promise.resolve({
        success: true,
        info: { ...info, players: 0, passwordProtected: false, version: "" },
        players: [],
      })
    );
    renderModal();

    expect(await screen.findByText("No players online")).toBeInTheDocument();
    expect(fact("Password protected")).toBe("No");
    expect(fact("Server-reported version")).toBe("—");
    expect(screen.queryByText("Address", { selector: "dt" })).toBeNull();
    expect(
      screen.queryByRole("list", { name: "Players online" })
    ).not.toBeInTheDocument();
  });

  it("refetches on Refresh and only disables Refresh while the query is in flight", async () => {
    let release: (value: GameQuerySnapshotResponse) => void = () => undefined;
    renderModal();
    await screen.findByText("Embervale Keep");

    snapshotMock.mockImplementationOnce(
      () =>
        new Promise<GameQuerySnapshotResponse>((resolve) => {
          release = resolve;
        })
    );
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));

    expect(snapshotMock).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button", { name: "Refresh" })).toBeDisabled();
    // Neither depends on the query (a down server can take seconds to time out).
    expect(screen.getByRole("button", { name: "Stop server" })).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Edit admin roles in config" })
    ).toBeEnabled();
    expect(screen.getByText("Querying server…")).toBeInTheDocument();

    await act(async () => {
      release({
        success: true,
        info: { ...info, serverName: "Embervale Keep II", players: 0 },
        players: [],
      });
      await Promise.resolve();
    });

    expect(await screen.findByText("Embervale Keep II")).toBeInTheDocument();
    expect(fact("Players")).toBe("0/16");
    expect(screen.getByRole("button", { name: "Refresh" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Stop server" })).toBeEnabled();
    expect(screen.queryByText("Querying server…")).not.toBeInTheDocument();
  });

  it("renders a failed query with its address and described error", async () => {
    installSnapshot(() =>
      Promise.resolve({
        success: false,
        errorKind: "timeout",
        error: "No response from 127.0.0.1:15637 within 2000 ms",
        host: "127.0.0.1",
        port: 15637,
      })
    );
    renderModal();

    const message = await screen.findByText(
      "timeout — No response from 127.0.0.1:15637 within 2000 ms"
    );
    expect(message).toHaveClass("palworld-admin-error");
    expect(fact("Address")).toBe("127.0.0.1:15637");
    expect(screen.queryByText("Server name", { selector: "dt" })).toBeNull();
    expect(screen.queryByText("No players online")).not.toBeInTheDocument();
  });

  it("renders the player list error when only the player query failed", async () => {
    installSnapshot(() =>
      Promise.resolve({
        success: true,
        info,
        players: null,
        playersError: "timeout — player list did not answer",
      })
    );
    renderModal();

    const message = await screen.findByText(
      "Player list unavailable: timeout — player list did not answer"
    );
    expect(message).toHaveClass("palworld-admin-error");
    expect(fact("Players")).toBe("3/16");
    expect(screen.queryByText("No players online")).not.toBeInTheDocument();
  });

  it("renders the thrown message when the query call rejects", async () => {
    installSnapshot(() => Promise.reject(new Error("IPC channel closed")));
    renderModal();

    expect(await screen.findByText("IPC channel closed")).toHaveClass(
      "palworld-admin-error"
    );
    expect(screen.getByRole("button", { name: "Refresh" })).toBeEnabled();
  });

  it("explains that moderation is in-game only and disables kick, ban and unban", async () => {
    renderModal();
    await screen.findByText("Embervale Keep");

    const moderation = section("Player moderation");
    expect(moderation).toHaveTextContent(
      "Enshrouded Dedicated Server has no remote admin API, so kick, ban and unban can't be sent from here. Join the server with an admin role password and use the in-game player list."
    );
    for (const label of ["Kick", "Ban", "Unban"]) {
      const button = within(moderation).getByRole("button", { name: label });
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute("title", UNSUPPORTED_TITLE);
    }
  });

  it("explains there is no remote announce or save and disables both", async () => {
    renderModal();
    await screen.findByText("Embervale Keep");

    const broadcast = section("Broadcast & world");
    expect(broadcast).toHaveTextContent(
      "There is no remote announce or save command. The server autosaves the world on its own schedule. Stop ends the process immediately, so progress since the last autosave can be lost."
    );
    for (const label of ["Announce", "Save world"]) {
      const button = within(broadcast).getByRole("button", { name: label });
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute("title", UNSUPPORTED_TITLE);
    }
  });

  it("opens admin roles in config when the roles callback is provided", async () => {
    const calls = renderModal();
    await screen.findByText("Embervale Keep");

    fireEvent.click(
      within(section("Player moderation")).getByRole("button", {
        name: "Edit admin roles in config",
      })
    );

    expect(calls.roles).toBe(1);
    expect(calls.close).toBe(0);
  });

  it("omits the roles button when no roles callback is provided", async () => {
    renderModal({ withRoles: false });
    await screen.findByText("Embervale Keep");

    expect(
      screen.queryByRole("button", { name: "Edit admin roles in config" })
    ).not.toBeInTheDocument();
  });

  it("stops the server and closes after the operator confirms", async () => {
    confirmSpy.mockReturnValue(true);
    const calls = renderModal();
    await screen.findByText("Embervale Keep");

    fireEvent.click(
      within(section("Server control")).getByRole("button", {
        name: "Stop server",
      })
    );

    expect(confirmSpy).toHaveBeenCalledWith(
      "Stop Enshrouded Dedicated Server? Players online will be disconnected and unsaved progress since the last autosave can be lost."
    );
    expect(calls.stop).toBe(1);
    expect(calls.close).toBe(1);
  });

  it("does nothing when the stop confirmation is declined", async () => {
    const calls = renderModal();
    await screen.findByText("Embervale Keep");

    fireEvent.click(screen.getByRole("button", { name: "Stop server" }));

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(calls.stop).toBe(0);
    expect(calls.close).toBe(0);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("does not query a stopped server and says it is not running", async () => {
    renderModal({ server: { ...enshrouded, isRunning: false } });
    await act(async () => {
      await Promise.resolve();
    });

    expect(snapshotMock).not.toHaveBeenCalled();
    expect(
      screen.getByText("Server is not running. Start it to see live status.")
    ).toBeInTheDocument();
    expect(screen.queryByText("Querying server…")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Edit admin roles in config" })
    ).toBeEnabled();
  });

  it("disables Stop server while the server is stopped", async () => {
    const calls = renderModal({ server: { ...enshrouded, isRunning: false } });
    await act(async () => {
      await Promise.resolve();
    });

    const stop = screen.getByRole("button", { name: "Stop server" });
    expect(stop).toBeDisabled();
    fireEvent.click(stop);

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(calls.stop).toBe(0);
  });

  it("never mentions Palworld or REST in its copy", async () => {
    renderModal();
    await screen.findByText("Embervale Keep");

    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toContain("Live status");
    expect(dialog.textContent).not.toMatch(/Palworld|\bREST\b/);
  });
});
