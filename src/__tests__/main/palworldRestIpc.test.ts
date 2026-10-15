import { getCapabilityRepository } from "../../main/catalog/capabilityRepository";
import {
  getPalworldRestStatus,
  invokePalworldRest,
} from "../../main/palworldRestIpc";
import { getServerConfig } from "../../main/serverConfig";

jest.mock("../../main/serverConfig", () => ({
  getServerConfig: jest.fn(),
}));

const mockGetServerConfig = jest.mocked(getServerConfig);

describe("palworldRestIpc capability gating", () => {
  beforeEach(() => {
    mockGetServerConfig.mockReset();
  });

  it("returns isPalworld false for Enshrouded (Admin over query, not REST)", async () => {
    expect(getCapabilityRepository().hasCapability(2278520, "rest_admin")).toBe(
      true
    );
    const status = await getPalworldRestStatus(2278520, "/servers/enshrouded");
    expect(status).toEqual({
      success: true,
      enabled: false,
      isPalworld: false,
    });
    expect(mockGetServerConfig).not.toHaveBeenCalled();
  });

  it("returns isPalworld false for apps missing from the catalog", async () => {
    const status = await getPalworldRestStatus(9999999, "/servers/unknown");
    expect(status).toEqual({
      success: true,
      enabled: false,
      isPalworld: false,
    });
    expect(mockGetServerConfig).not.toHaveBeenCalled();
  });

  it("reads Palworld REST status via catalog capability + adapter", async () => {
    mockGetServerConfig.mockResolvedValue({
      success: true,
      content: {
        OptionSettings: {
          RESTAPIEnabled: "True",
          RESTAPIPort: "8212",
          AdminPassword: "secret",
        },
      },
      format: "ini",
      filePath: "/pal/config.ini",
    });

    const status = await getPalworldRestStatus(1623730, "/servers/pal");
    expect(status).toEqual({
      success: true,
      enabled: true,
      isPalworld: true,
      port: 8212,
    });
    expect(getCapabilityRepository().hasCapability(1623730, "rest_admin")).toBe(
      true
    );
  });

  it.each([
    [2278520, "Enshrouded (query protocol)"],
    [9999999, "an unknown app"],
  ])(
    "rejects REST invoke for %s (%s) without reading config",
    async (appId) => {
      const result = await invokePalworldRest(
        appId,
        "/servers/other",
        "GET",
        "info"
      );
      expect(result).toEqual({
        success: false,
        error: "REST admin is not available for this server",
      });
      expect(mockGetServerConfig).not.toHaveBeenCalled();
    }
  );

  it("surfaces config read failures for REST-capable games", async () => {
    mockGetServerConfig.mockResolvedValue({
      success: false,
      error: "config missing",
    });

    const status = await getPalworldRestStatus(1623730, "/servers/pal");
    expect(status).toEqual({
      success: false,
      enabled: false,
      isPalworld: true,
      error: "config missing",
    });

    const invoke = await invokePalworldRest(
      1623730,
      "/servers/pal",
      "GET",
      "info"
    );
    expect(invoke.success).toBe(false);
    expect(invoke.error).toBe("config missing");
  });

  it("invokes the Palworld adapter for a successful REST call", async () => {
    mockGetServerConfig.mockResolvedValue({
      success: true,
      content: {
        OptionSettings: {
          RESTAPIEnabled: "True",
          RESTAPIPort: "8212",
          AdminPassword: "secret",
        },
      },
      format: "ini",
      filePath: "/pal/config.ini",
    });

    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ ok: true }),
      text: () => Promise.resolve(""),
    });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchImpl as typeof globalThis.fetch;

    try {
      const result = await invokePalworldRest(
        1623730,
        "/servers/pal",
        "GET",
        "info"
      );
      expect(result.success).toBe(true);
      expect(fetchImpl).toHaveBeenCalled();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
