import { parseIniContent } from "../../main/iniConfig";
import {
  buildPalworldRestAuthHeader,
  buildPalworldRestUrl,
  callPalworldRest,
  extractPalworldRestConfig,
  PALWORLD_APP_ID,
  type PalworldRestFetch,
} from "../../main/palworldRest";

function mockFetchResponse(options: {
  ok: boolean;
  status: number;
  jsonValue?: unknown;
  textValue?: string;
  jsonError?: Error;
}): ReturnType<PalworldRestFetch> {
  return Promise.resolve({
    ok: options.ok,
    status: options.status,
    json: () =>
      options.jsonError !== undefined
        ? Promise.reject(options.jsonError)
        : Promise.resolve(options.jsonValue ?? {}),
    text: () => Promise.resolve(options.textValue ?? ""),
  });
}

describe("palworldRest", () => {
  describe("extractPalworldRestConfig", () => {
    it("reads RESTAPIEnabled, RESTAPIPort, and AdminPassword from OptionSettings", () => {
      const parsed = parseIniContent(
        `
[/Script/Pal.PalGameWorldSettings]
OptionSettings=(Difficulty=None,AdminPassword="secret",RESTAPIEnabled=True,RESTAPIPort=8212)
`.trim()
      );

      expect(extractPalworldRestConfig(parsed)).toEqual({
        enabled: true,
        port: 8212,
        adminPassword: "secret",
      });
    });

    it("reports disabled when RESTAPIEnabled is not True", () => {
      const parsed = parseIniContent(
        `
[/Script/Pal.PalGameWorldSettings]
OptionSettings=(AdminPassword="secret",RESTAPIEnabled=False,RESTAPIPort=8212)
`.trim()
      );

      expect(extractPalworldRestConfig(parsed).enabled).toBe(false);
    });

    it("defaults port to 8212 when missing", () => {
      const parsed = parseIniContent(
        `
[/Script/Pal.PalGameWorldSettings]
OptionSettings=(AdminPassword="x",RESTAPIEnabled=True)
`.trim()
      );

      expect(extractPalworldRestConfig(parsed).port).toBe(8212);
    });

    it("returns disabled empty config for non-object content", () => {
      expect(extractPalworldRestConfig({})).toEqual({
        enabled: false,
        port: 8212,
        adminPassword: "",
      });
    });
  });

  describe("URL and auth helpers", () => {
    it("builds localhost REST URLs under /v1/api", () => {
      expect(buildPalworldRestUrl(8212, "info")).toBe(
        "http://127.0.0.1:8212/v1/api/info"
      );
      expect(buildPalworldRestUrl(9000, "game-data")).toBe(
        "http://127.0.0.1:9000/v1/api/game-data"
      );
    });

    it("builds Basic Auth header for admin password", () => {
      const header = buildPalworldRestAuthHeader("secret");
      expect(header).toBe(
        `Basic ${Buffer.from("admin:secret").toString("base64")}`
      );
    });
  });

  describe("callPalworldRest", () => {
    it("GETs with Basic Auth and returns JSON", async () => {
      const fetchImpl: PalworldRestFetch = jest.fn().mockImplementation(() =>
        mockFetchResponse({
          ok: true,
          status: 200,
          jsonValue: { version: "1.0", servername: "Test" },
        })
      );

      const result = await callPalworldRest(
        {
          enabled: true,
          port: 8212,
          adminPassword: "secret",
        },
        { method: "GET", endpoint: "info" },
        fetchImpl
      );

      expect(result).toEqual({
        success: true,
        data: { version: "1.0", servername: "Test" },
      });
      expect(fetchImpl).toHaveBeenCalledWith(
        "http://127.0.0.1:8212/v1/api/info",
        expect.objectContaining({
          method: "GET",
          headers: expect.objectContaining({
            Authorization: buildPalworldRestAuthHeader("secret"),
          }) as Record<string, unknown>,
        }) as Record<string, unknown>
      );
    });

    it("POSTs JSON body when provided", async () => {
      const fetchImpl: PalworldRestFetch = jest
        .fn()
        .mockImplementation(() =>
          mockFetchResponse({ ok: true, status: 200, jsonValue: {} })
        );

      await callPalworldRest(
        {
          enabled: true,
          port: 8212,
          adminPassword: "secret",
        },
        {
          method: "POST",
          endpoint: "announce",
          body: { message: "hello" },
        },
        fetchImpl
      );

      expect(fetchImpl).toHaveBeenCalledWith(
        "http://127.0.0.1:8212/v1/api/announce",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ message: "hello" }),
          headers: expect.objectContaining({
            "Content-Type": "application/json",
          }) as Record<string, unknown>,
        }) as Record<string, unknown>
      );
    });

    it("fails when REST is disabled in config", async () => {
      const fetchImpl: PalworldRestFetch = jest.fn();
      const result = await callPalworldRest(
        { enabled: false, port: 8212, adminPassword: "" },
        { method: "GET", endpoint: "info" },
        fetchImpl
      );
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/not enabled/i);
      expect(fetchImpl).not.toHaveBeenCalled();
    });

    it("surfaces HTTP errors", async () => {
      const fetchImpl: PalworldRestFetch = jest.fn().mockImplementation(() =>
        mockFetchResponse({
          ok: false,
          status: 401,
          jsonError: new Error("no json"),
          textValue: "unauthorized",
        })
      );

      const result = await callPalworldRest(
        { enabled: true, port: 8212, adminPassword: "bad" },
        { method: "GET", endpoint: "players" },
        fetchImpl
      );

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/401/);
    });
  });

  it("exports Palworld Steam app id constant", () => {
    expect(PALWORLD_APP_ID).toBe(1623730);
  });
});
