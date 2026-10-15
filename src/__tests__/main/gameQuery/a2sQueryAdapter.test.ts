import os from "os";

import { a2sQueryAdapter } from "../../../main/gameQuery/adapters/a2sQueryAdapter";
import {
  queryA2sInfo,
  queryA2sPlayers,
} from "../../../main/gameQuery/a2sClient";
import type { A2sInfo } from "../../../main/gameQuery/a2sClient";
import type { UdpExchange } from "../../../main/gameQuery/types";
import type { ServerQueryMetadata } from "../../../main/catalog/serverCapabilities";

jest.mock("../../../main/gameQuery/a2sClient", () => ({
  queryA2sInfo: jest.fn(),
  queryA2sPlayers: jest.fn(),
}));

const mockQueryInfo = jest.mocked(queryA2sInfo);
const mockQueryPlayers = jest.mocked(queryA2sPlayers);

const ENSHROUDED_METADATA: ServerQueryMetadata = {
  adapterId: "a2s",
  defaultPort: 15637,
  portConfigKey: "queryPort",
  hostConfigKey: "ip",
  adminConfigKey: "userGroups",
};

const SAMPLE_INFO: A2sInfo = {
  protocol: 17,
  name: "Shroud Squad",
  map: "Embervale",
  folder: "enshrouded",
  game: "Enshrouded",
  steamAppId: 0,
  players: 3,
  maxPlayers: 16,
  bots: 0,
  serverType: "d",
  environment: "w",
  passwordProtected: true,
  vacSecured: false,
  version: "1.0.0.0",
};

describe("a2sQueryAdapter.extractTarget (042.1 config binding)", () => {
  beforeEach(() => {
    // This machine owns 192.168.1.20 and 10.0.0.5 (plus loopback).
    jest.spyOn(os, "networkInterfaces").mockReturnValue({
      lo: [
        {
          address: "127.0.0.1",
          netmask: "255.0.0.0",
          family: "IPv4",
          mac: "00:00:00:00:00:00",
          internal: true,
          cidr: "127.0.0.1/8",
        },
      ],
      eth0: [
        {
          address: "192.168.1.20",
          netmask: "255.255.255.0",
          family: "IPv4",
          mac: "aa:bb:cc:dd:ee:ff",
          internal: false,
          cidr: "192.168.1.20/24",
        },
        {
          address: "10.0.0.5",
          netmask: "255.0.0.0",
          family: "IPv4",
          mac: "aa:bb:cc:dd:ee:00",
          internal: false,
          cidr: "10.0.0.5/8",
        },
      ],
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it.each([
    [
      { queryPort: 15700, ip: "0.0.0.0" },
      { host: "127.0.0.1", port: 15700 },
    ],
    [{ queryPort: "15701" }, { host: "127.0.0.1", port: 15701 }],
    [{}, { host: "127.0.0.1", port: 15637 }],
    [{ queryPort: 0 }, { host: "127.0.0.1", port: 15637 }],
    [{ queryPort: 70000 }, { host: "127.0.0.1", port: 15637 }],
    [{ queryPort: 15637.5 }, { host: "127.0.0.1", port: 15637 }],
    [{ queryPort: "abc" }, { host: "127.0.0.1", port: 15637 }],
    [{ queryPort: true }, { host: "127.0.0.1", port: 15637 }],
    [{ ip: "192.168.1.20" }, { host: "192.168.1.20", port: 15637 }],
    [{ ip: " 10.0.0.5 " }, { host: "10.0.0.5", port: 15637 }],
    [{ ip: "localhost" }, { host: "127.0.0.1", port: 15637 }],
    // Not an address of this machine: never aim the query off-host.
    [{ ip: "8.8.8.8" }, { host: "127.0.0.1", port: 15637 }],
    [{ ip: "192.168.1.99" }, { host: "127.0.0.1", port: 15637 }],
    [{ ip: "127.0.0.2" }, { host: "127.0.0.2", port: 15637 }],
    [{ ip: "" }, { host: "127.0.0.1", port: 15637 }],
    [{ ip: 12 }, { host: "127.0.0.1", port: 15637 }],
  ])("maps config %j to target %j", (content, expected) => {
    expect(a2sQueryAdapter.extractTarget(content, ENSHROUDED_METADATA)).toEqual(
      expected
    );
  });

  it("ignores the bind address when the catalog has no host key", () => {
    expect(
      a2sQueryAdapter.extractTarget(
        { queryPort: 27015, ip: "192.168.1.20" },
        { ...ENSHROUDED_METADATA, hostConfigKey: null }
      )
    ).toEqual({ host: "127.0.0.1", port: 27015 });
  });

  it("uses the catalog port key and default instead of hard-coded names", () => {
    expect(
      a2sQueryAdapter.extractTarget(
        { QueryPort: 27016, queryPort: 1 },
        {
          ...ENSHROUDED_METADATA,
          portConfigKey: "QueryPort",
          defaultPort: 27015,
        }
      )
    ).toEqual({ host: "127.0.0.1", port: 27016 });
    expect(
      a2sQueryAdapter.extractTarget(
        {},
        { ...ENSHROUDED_METADATA, defaultPort: 27015 }
      )
    ).toEqual({ host: "127.0.0.1", port: 27015 });
  });

  it("refuses metadata that belongs to a different adapter", () => {
    expect(() =>
      a2sQueryAdapter.extractTarget(
        {},
        { ...ENSHROUDED_METADATA, adapterId: "palworld" }
      )
    ).toThrow(/cannot handle adapter_id "palworld"/);
  });
});

describe("a2sQueryAdapter.querySnapshot", () => {
  const target = { host: "127.0.0.1", port: 15637 };
  const exchange: UdpExchange = jest.fn();

  beforeEach(() => {
    mockQueryInfo.mockReset();
    mockQueryPlayers.mockReset();
  });

  it("normalizes info and players from A2S and passes the transport through", async () => {
    mockQueryInfo.mockResolvedValue({ ok: true, value: SAMPLE_INFO });
    mockQueryPlayers.mockResolvedValue({
      ok: true,
      value: [
        { index: 0, name: "Ash", score: 4, durationSeconds: 61.5 },
        { index: 1, name: "", score: 0, durationSeconds: 5 },
      ],
    });

    await expect(
      a2sQueryAdapter.querySnapshot(target, exchange)
    ).resolves.toEqual({
      success: true,
      info: {
        serverName: "Shroud Squad",
        map: "Embervale",
        game: "Enshrouded",
        version: "1.0.0.0",
        players: 3,
        maxPlayers: 16,
        bots: 0,
        passwordProtected: true,
      },
      players: [
        { name: "Ash", score: 4, durationSeconds: 61.5 },
        { name: "", score: 0, durationSeconds: 5 },
      ],
    });
    expect(mockQueryInfo).toHaveBeenCalledWith(target, { exchange });
    expect(mockQueryPlayers).toHaveBeenCalledWith(target, { exchange });
  });

  it("keeps the info when only the player list fails", async () => {
    mockQueryInfo.mockResolvedValue({ ok: true, value: SAMPLE_INFO });
    mockQueryPlayers.mockResolvedValue({
      ok: false,
      kind: "parse",
      error: "Truncated A2S_PLAYER entry",
    });

    const result = await a2sQueryAdapter.querySnapshot(target, exchange);
    expect(result.success).toBe(true);
    expect(result.info?.players).toBe(3);
    expect(result.players).toBeNull();
    expect(result.playersError).toBe("Truncated A2S_PLAYER entry");
  });

  it("returns a structured error and skips the player query when info fails", async () => {
    mockQueryInfo.mockResolvedValue({
      ok: false,
      kind: "timeout",
      error: "No response from 127.0.0.1:15637 within 2000 ms",
    });

    await expect(
      a2sQueryAdapter.querySnapshot(target, exchange)
    ).resolves.toEqual({
      success: false,
      errorKind: "timeout",
      error: "No response from 127.0.0.1:15637 within 2000 ms",
    });
    expect(mockQueryPlayers).not.toHaveBeenCalled();
  });
});
