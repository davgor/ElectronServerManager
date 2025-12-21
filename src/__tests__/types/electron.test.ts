import type { SteamServer } from "../../types/electron";

describe("Electron Types", () => {
  it("should define SteamServer interface with required properties", () => {
    // This is a type-only test to ensure the interface is correctly defined
    const testServer: SteamServer = {
      name: "Test Server",
      appId: 12345,
      installPath: "/path/to/server",
      isRunning: true,
    };

    expect(testServer.name).toBe("Test Server");
    expect(testServer.appId).toBe(12345);
    expect(testServer.installPath).toBe("/path/to/server");
    expect(testServer.isRunning).toBe(true);
  });

  it("should allow SteamServer objects to be created", () => {
    const servers: SteamServer[] = [
      {
        name: "Valheim",
        appId: 1396110,
        installPath: "C:\\Games\\Valheim",
        isRunning: true,
      },
      {
        name: "Ark",
        appId: 376030,
        installPath: "C:\\Games\\Ark",
        isRunning: false,
      },
    ];

    expect(servers).toHaveLength(2);
    expect(servers[0].name).toBe("Valheim");
    expect(servers[1].isRunning).toBe(false);
  });
});
