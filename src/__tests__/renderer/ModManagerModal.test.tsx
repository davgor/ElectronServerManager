import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ModManagerModal } from "../../renderer/ModManagerModal";
import type { ServerModSummary, SteamServer } from "../../types/ipc";

const server: SteamServer = {
  name: "Palworld Dedicated Server",
  appId: 1623730,
  installPath: "/servers/pal",
  isRunning: false,
};

const sampleMod: ServerModSummary = {
  id: "mod-1",
  displayName: "Fast Work",
  packageName: "FastWork",
  sourceZipName: "fast.zip",
  kind: "workshop",
  enabled: true,
  importedAt: "2026-01-01T00:00:00.000Z",
};

describe("ModManagerModal", () => {
  beforeEach(() => {
    Object.defineProperty(window, "electron", {
      configurable: true,
      value: {
        listServerMods: jest.fn().mockResolvedValue({
          success: true,
          mods: [sampleMod],
        }),
        selectAndImportModZip: jest.fn().mockResolvedValue({
          success: true,
          mod: sampleMod,
        }),
        setServerModEnabled: jest.fn().mockResolvedValue({ success: true }),
        removeServerMod: jest.fn().mockResolvedValue({ success: true }),
      },
    });
  });

  it("lists mods on open", async () => {
    render(<ModManagerModal server={server} onClose={jest.fn()} />);
    expect(await screen.findByText("Fast Work")).toBeInTheDocument();
    expect(window.electron.listServerMods).toHaveBeenCalledWith(
      1623730,
      "/servers/pal"
    );
  });

  it("imports a zip via Add zip file", async () => {
    const user = userEvent.setup();
    render(<ModManagerModal server={server} onClose={jest.fn()} />);
    await screen.findByText("Fast Work");
    await user.click(screen.getByRole("button", { name: "Add zip file" }));
    await waitFor(() => {
      expect(window.electron.selectAndImportModZip).toHaveBeenCalledWith(
        1623730,
        "/servers/pal"
      );
    });
  });

  it("disables a mod", async () => {
    const user = userEvent.setup();
    render(<ModManagerModal server={server} onClose={jest.fn()} />);
    await screen.findByText("Fast Work");
    await user.click(screen.getByRole("button", { name: "Disable" }));
    await waitFor(() => {
      expect(window.electron.setServerModEnabled).toHaveBeenCalledWith(
        "mod-1",
        false
      );
    });
  });

  it("removes a mod after confirm", async () => {
    const user = userEvent.setup();
    jest.spyOn(window, "confirm").mockReturnValue(true);
    render(<ModManagerModal server={server} onClose={jest.fn()} />);
    await screen.findByText("Fast Work");
    await user.click(screen.getByRole("button", { name: /Remove Fast Work/i }));
    await waitFor(() => {
      expect(window.electron.removeServerMod).toHaveBeenCalledWith("mod-1");
    });
  });

  it("shows import errors from IPC", async () => {
    Object.defineProperty(window, "electron", {
      configurable: true,
      value: {
        listServerMods: jest.fn().mockResolvedValue({
          success: true,
          mods: [],
        }),
        selectAndImportModZip: jest.fn().mockResolvedValue({
          success: false,
          error: "bad zip",
        }),
        setServerModEnabled: jest.fn(),
        removeServerMod: jest.fn(),
      },
    });
    const user = userEvent.setup();
    render(<ModManagerModal server={server} onClose={jest.fn()} />);
    await screen.findByText("No mods imported yet.");
    await user.click(screen.getByRole("button", { name: "Add zip file" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("bad zip");
  });

  it("ignores canceled zip picker", async () => {
    Object.defineProperty(window, "electron", {
      configurable: true,
      value: {
        listServerMods: jest.fn().mockResolvedValue({
          success: true,
          mods: [],
        }),
        selectAndImportModZip: jest.fn().mockResolvedValue({
          success: false,
          canceled: true,
        }),
        setServerModEnabled: jest.fn(),
        removeServerMod: jest.fn(),
      },
    });
    const user = userEvent.setup();
    render(<ModManagerModal server={server} onClose={jest.fn()} />);
    await screen.findByText("No mods imported yet.");
    await user.click(screen.getByRole("button", { name: "Add zip file" }));
    await waitFor(() => {
      expect(window.electron.selectAndImportModZip).toHaveBeenCalled();
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
