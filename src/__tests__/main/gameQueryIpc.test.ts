import { getGameQuerySnapshot } from "../../main/gameQueryIpc";
import { queryA2sInfo, queryA2sPlayers } from "../../main/gameQuery/a2sClient";
import { getCapabilityRepository } from "../../main/catalog/capabilityRepository";
import { getServerConfig } from "../../main/serverConfig";

import { installTestCatalog } from "./catalog/testCatalog";

jest.mock("../../main/serverConfig", () => ({
  getServerConfig: jest.fn(),
}));

jest.mock("../../main/gameQuery/a2sClient", () => ({
  queryA2sInfo: jest.fn(),
  queryA2sPlayers: jest.fn(),
}));

const mockGetServerConfig = jest.mocked(getServerConfig);
const mockQueryInfo = jest.mocked(queryA2sInfo);
const mockQueryPlayers = jest.mocked(queryA2sPlayers);

const ENSHROUDED_APP_ID = 2278520;
const PALWORLD_APP_ID = 1623730;

describe("getGameQuerySnapshot (042.2 IPC gating)", () => {
  beforeEach(() => {
    installTestCatalog();
    mockGetServerConfig.mockReset();
    mockQueryInfo.mockReset();
    mockQueryPlayers.mockReset();
  });

  it("treats apps without query metadata as unavailable and reads nothing", async () => {
    await expect(getGameQuerySnapshot(9999999, "/servers/x")).resolves.toEqual({
      success: false,
      errorKind: "unavailable",
      error: "Server query is not available for this server",
    });
    expect(mockGetServerConfig).not.toHaveBeenCalled();
    expect(mockQueryInfo).not.toHaveBeenCalled();
  });

  it("never queries REST-protocol games such as Palworld", async () => {
    const result = await getGameQuerySnapshot(PALWORLD_APP_ID, "/servers/pal");
    expect(result.success).toBe(false);
    expect(result.errorKind).toBe("unavailable");
    expect(mockGetServerConfig).not.toHaveBeenCalled();
  });

  it("queries Enshrouded on the port and bind address from its JSON config", async () => {
    mockGetServerConfig.mockResolvedValue({
      success: true,
      content: { name: "Shroud Squad", queryPort: 15700, ip: "0.0.0.0" },
      format: "json",
      filePath: "/servers/enshrouded/enshrouded_server.json",
    });
    mockQueryInfo.mockResolvedValue({
      ok: true,
      value: {
        protocol: 17,
        name: "Shroud Squad",
        map: "Embervale",
        folder: "enshrouded",
        game: "Enshrouded",
        steamAppId: 0,
        players: 0,
        maxPlayers: 16,
        bots: 0,
        serverType: "d",
        environment: "w",
        passwordProtected: false,
        vacSecured: false,
        version: "1.0.0.0",
      },
    });
    mockQueryPlayers.mockResolvedValue({ ok: true, value: [] });

    const result = await getGameQuerySnapshot(
      ENSHROUDED_APP_ID,
      "/servers/enshrouded"
    );

    expect(mockGetServerConfig).toHaveBeenCalledWith(
      ENSHROUDED_APP_ID,
      "/servers/enshrouded"
    );
    expect(mockQueryInfo).toHaveBeenCalledWith(
      { host: "127.0.0.1", port: 15700 },
      { exchange: undefined }
    );
    expect(result).toEqual({
      success: true,
      host: "127.0.0.1",
      port: 15700,
      info: {
        serverName: "Shroud Squad",
        map: "Embervale",
        game: "Enshrouded",
        version: "1.0.0.0",
        players: 0,
        maxPlayers: 16,
        bots: 0,
        passwordProtected: false,
      },
      players: [],
    });
  });

  it("reports the query target alongside a query failure", async () => {
    mockGetServerConfig.mockResolvedValue({
      success: true,
      content: {},
      format: "json",
    });
    mockQueryInfo.mockResolvedValue({
      ok: false,
      kind: "timeout",
      error: "No response from 127.0.0.1:15637 within 2000 ms",
    });

    await expect(
      getGameQuerySnapshot(ENSHROUDED_APP_ID, "/servers/enshrouded")
    ).resolves.toEqual({
      success: false,
      errorKind: "timeout",
      error: "No response from 127.0.0.1:15637 within 2000 ms",
      host: "127.0.0.1",
      port: 15637,
    });
  });

  it.each([null, ["queryPort", 15637], "queryPort=15637"])(
    "returns a config error instead of throwing for non-object config %j",
    async (content) => {
      mockGetServerConfig.mockResolvedValue({
        success: true,
        // A literal `null` / array / string JSON file parses to these.
        content: content as unknown as Record<string, unknown>,
        format: "json",
      });

      await expect(
        getGameQuerySnapshot(ENSHROUDED_APP_ID, "/servers/enshrouded")
      ).resolves.toEqual({
        success: false,
        errorKind: "config",
        error: "Server config is not a JSON object",
      });
      expect(mockQueryInfo).not.toHaveBeenCalled();
    }
  );

  it("returns a config error without querying when the config is unreadable", async () => {
    mockGetServerConfig.mockResolvedValue({
      success: false,
      error: "Config file not found",
    });

    await expect(
      getGameQuerySnapshot(ENSHROUDED_APP_ID, "/servers/enshrouded")
    ).resolves.toEqual({
      success: false,
      errorKind: "config",
      error: "Config file not found",
    });
    expect(mockQueryInfo).not.toHaveBeenCalled();
  });

  it("reports an unregistered adapter id instead of throwing", async () => {
    const getQueryMetadata = jest
      .spyOn(getCapabilityRepository(), "getQueryMetadata")
      .mockReturnValue({
        adapterId: "gamespy",
        defaultPort: 29900,
        portConfigKey: "queryPort",
        hostConfigKey: null,
        adminConfigKey: null,
      });
    try {
      const result = await getGameQuerySnapshot(
        ENSHROUDED_APP_ID,
        "/servers/enshrouded"
      );
      expect(result).toEqual({
        success: false,
        errorKind: "unavailable",
        error: 'No query adapter registered for id "gamespy"',
      });
      expect(mockGetServerConfig).not.toHaveBeenCalled();
    } finally {
      getQueryMetadata.mockRestore();
    }
  });
});
