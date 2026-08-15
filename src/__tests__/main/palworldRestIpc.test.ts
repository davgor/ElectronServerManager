import { getCatalogRepository } from "../../main/catalog/catalogRepository";
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

  it("returns isPalworld false for Enshrouded (no rest_admin capability)", async () => {
    const status = await getPalworldRestStatus(2278520, "/servers/enshrouded");
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
    expect(getCatalogRepository().hasCapability(1623730, "rest_admin")).toBe(
      true
    );
  });

  it("rejects REST invoke for games without rest_admin", async () => {
    const result = await invokePalworldRest(
      2278520,
      "/servers/enshrouded",
      "GET",
      "info"
    );
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not available/i);
  });
});
