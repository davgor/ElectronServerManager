import type { ServerRestMetadata } from "../../../main/catalog/serverCapabilities";
import { palworldRestAdapter } from "../../../main/gameRest/adapters/palworldRestAdapter";

const PALWORLD_META: ServerRestMetadata = {
  adapterId: "palworld",
  defaultPort: 8212,
  enabledConfigKey: "RESTAPIEnabled",
  portConfigKey: "RESTAPIPort",
  passwordConfigKey: "AdminPassword",
};

describe("palworldRestAdapter", () => {
  it("extracts config using catalog metadata keys", () => {
    const config = palworldRestAdapter.extractConfig(
      {
        OptionSettings: {
          RESTAPIEnabled: "True",
          RESTAPIPort: "8212",
          AdminPassword: "pw",
        },
      },
      PALWORLD_META
    );
    expect(config).toEqual({
      enabled: true,
      port: 8212,
      adminPassword: "pw",
    });
  });

  it("rejects extractConfig when metadata adapter_id is not palworld", () => {
    expect(() =>
      palworldRestAdapter.extractConfig(
        {},
        {
          adapterId: "other",
          defaultPort: 1,
          enabledConfigKey: "a",
          portConfigKey: "b",
          passwordConfigKey: "c",
        }
      )
    ).toThrow(/cannot handle adapter_id/i);
  });

  it("rejects unknown REST endpoints", async () => {
    const result = await palworldRestAdapter.call(
      { enabled: true, port: 8212, adminPassword: "pw" },
      { method: "GET", endpoint: "not-a-real-endpoint" }
    );
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Unknown Palworld REST endpoint/i);
  });

  it("forwards known endpoints to the Palworld HTTP client", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ version: "1" }),
      text: () => Promise.resolve(""),
    });

    const result = await palworldRestAdapter.call(
      { enabled: true, port: 8212, adminPassword: "pw" },
      { method: "GET", endpoint: "info" },
      fetchImpl
    );

    expect(result.success).toBe(true);
    expect(fetchImpl).toHaveBeenCalled();
  });
});
