import { promises as fs } from "fs";

import { getServerConfig, saveServerConfig } from "../../main/serverConfig";

jest.mock("fs", () => ({
  promises: {
    stat: jest.fn(),
    readFile: jest.fn(),
    writeFile: jest.fn(),
  },
}));

const mockFs = fs as jest.Mocked<typeof fs>;

async function withPlatform(
  platform: NodeJS.Platform,
  run: () => Promise<void>
): Promise<void> {
  const original = Object.getOwnPropertyDescriptor(process, "platform");
  Object.defineProperty(process, "platform", {
    value: platform,
    configurable: true,
  });
  try {
    await run();
  } finally {
    if (original) {
      Object.defineProperty(process, "platform", original);
    }
  }
}

describe("serverConfig", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe("getServerConfig", () => {
    it("returns error when app has no config mapping", async () => {
      const result = await getServerConfig(999999, "C:\\Games\\Unknown");

      expect(result).toEqual({
        success: false,
        error: "No config mapping for app 999999",
      });
    });

    it("returns error when config file is missing", async () => {
      mockFs.stat.mockRejectedValueOnce(new Error("ENOENT"));

      const result = await getServerConfig(
        2278520,
        "C:\\Games\\EnshroudedServer"
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("Config file not found");
    });

    it("reads Enshrouded JSON config", async () => {
      mockFs.stat.mockResolvedValueOnce({} as never);
      mockFs.readFile.mockResolvedValueOnce(
        JSON.stringify({ name: "My Server", password: "secret" }) as never
      );

      const result = await getServerConfig(
        2278520,
        "C:\\Games\\EnshroudedServer"
      );

      expect(result.success).toBe(true);
      expect(result.content).toEqual({
        name: "My Server",
        password: "secret",
      });
      expect(result.format).toBe("json");
      expect(result.filePath).toContain("enshrouded_server.json");
    });

    it("reads Palworld INI config", async () => {
      const iniContent = `[ServerSettings]
ServerName="Test World"
TickRate=30`;

      mockFs.stat.mockResolvedValueOnce({} as never);
      mockFs.readFile.mockResolvedValueOnce(iniContent as never);

      const result = await getServerConfig(1623730, "C:\\Games\\PalServer");

      expect(result.success).toBe(true);
      expect(result.format).toBe("ini");
      expect(result.filePath).toContain("PalWorldSettings.ini");
      expect(result.content).toEqual({
        ServerSettings: {
          ServerName: "Test World",
          TickRate: 30,
        },
      });
    });

    it("resolves Palworld config under WindowsServer on win32", async () => {
      await withPlatform("win32", async () => {
        mockFs.stat.mockResolvedValueOnce({} as never);
        mockFs.readFile.mockResolvedValueOnce("" as never);

        const result = await getServerConfig(1623730, "C:\\Games\\PalServer");

        expect(result.success).toBe(true);
        expect(result.filePath).toContain("WindowsServer");
      });
    });

    it("resolves Palworld config under LinuxServer on linux", async () => {
      await withPlatform("linux", async () => {
        mockFs.stat.mockResolvedValueOnce({} as never);
        mockFs.readFile.mockResolvedValueOnce("" as never);

        const result = await getServerConfig(1623730, "/opt/steam/PalServer");

        expect(result.success).toBe(true);
        expect(result.filePath).toContain("LinuxServer");
        expect(result.filePath).not.toContain("WindowsServer");
      });
    });
  });

  describe("saveServerConfig", () => {
    it("returns error when app has no config mapping", async () => {
      const result = await saveServerConfig(
        999999,
        "C:\\Games\\Unknown",
        {},
        "json"
      );

      expect(result).toEqual({
        success: false,
        error: "No config mapping for app 999999",
      });
    });

    it("writes Enshrouded JSON config", async () => {
      const content = { name: "Updated Server", password: "new" };

      const result = await saveServerConfig(
        2278520,
        "C:\\Games\\EnshroudedServer",
        content,
        "json"
      );

      expect(result).toEqual({ success: true });
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining("enshrouded_server.json"),
        JSON.stringify(content, null, 2),
        "utf-8"
      );
    });

    it("writes Palworld INI config", async () => {
      const content = {
        ServerSettings: {
          ServerName: "Saved World",
          TickRate: 60,
        },
      };

      const result = await saveServerConfig(
        1623730,
        "C:\\Games\\PalServer",
        content,
        "ini"
      );

      expect(result).toEqual({ success: true });
      const writeCall = mockFs.writeFile.mock.calls[0];
      expect(writeCall[0]).toContain("PalWorldSettings.ini");
      expect(String(writeCall[1])).toContain("[ServerSettings]");
      expect(String(writeCall[1])).toContain("ServerName=Saved World");
      expect(String(writeCall[1])).toContain("TickRate=60");
    });

    it("writes Palworld config under LinuxServer on linux", async () => {
      await withPlatform("linux", async () => {
        const result = await saveServerConfig(
          1623730,
          "/opt/steam/PalServer",
          { ServerSettings: { ServerName: "Linux World" } },
          "ini"
        );

        expect(result).toEqual({ success: true });
        const writeCall = mockFs.writeFile.mock.calls[0];
        expect(writeCall[0]).toContain("LinuxServer");
        expect(writeCall[0]).not.toContain("WindowsServer");
      });
    });
  });
});
