import { CatalogRepository } from "../../../main/catalog/catalogRepository";
import { openAndMigrateCatalogDb } from "../../../main/catalog/openAndMigrateCatalogDb";
import {
  resolveServerConfigLocation,
  resolveServerExecutable,
  resolveServerSaveLocation,
} from "../../../main/steamDetection";

const ENSHROUDED_APP_ID = 2278520;
const PALWORLD_APP_ID = 1623730;

describe("CatalogRepository", () => {
  it("returns ServerInfo-compatible data for both seeded games", () => {
    const db = openAndMigrateCatalogDb(":memory:");
    try {
      const repo = new CatalogRepository(db);
      const palworld = repo.getServer(PALWORLD_APP_ID);
      const enshrouded = repo.getServer(ENSHROUDED_APP_ID);

      expect(palworld).toEqual({
        name: "Palworld Dedicated Server",
        folderName: "PalServer",
        executable: "PalServer.exe",
        executables: { linux: "PalServer.sh" },
        saveLocation: "Pal/Saved/SaveGames",
        configLocation: "Pal/Saved/Config/WindowsServer/PalWorldSettings.ini",
        configLocations: {
          linux: "Pal/Saved/Config/LinuxServer/PalWorldSettings.ini",
        },
      });

      expect(enshrouded).toEqual({
        name: "Enshrouded Dedicated Server",
        folderName: "EnshroudedServer",
        executable: "enshrouded_server.exe",
        saveLocation: "savegame",
        configLocation: "enshrouded_server.json",
      });

      expect(repo.listServers()).toHaveLength(2);
    } finally {
      db.close();
    }
  });

  it("returns null for a missing app ID", () => {
    const db = openAndMigrateCatalogDb(":memory:");
    try {
      const repo = new CatalogRepository(db);
      expect(repo.getServer(9999999)).toBeNull();
    } finally {
      db.close();
    }
  });

  it("supports platform resolution helpers against DB-backed data", () => {
    const db = openAndMigrateCatalogDb(":memory:");
    try {
      const repo = new CatalogRepository(db);
      const palworld = repo.getServer(PALWORLD_APP_ID);
      const enshrouded = repo.getServer(ENSHROUDED_APP_ID);
      expect(palworld).not.toBeNull();
      expect(enshrouded).not.toBeNull();

      expect(resolveServerExecutable(palworld!, "win32")).toBe("PalServer.exe");
      expect(resolveServerExecutable(palworld!, "linux")).toBe("PalServer.sh");
      expect(resolveServerExecutable(enshrouded!, "linux")).toBe(
        "enshrouded_server.exe"
      );

      expect(resolveServerConfigLocation(palworld!, "linux")).toBe(
        "Pal/Saved/Config/LinuxServer/PalWorldSettings.ini"
      );
      expect(resolveServerSaveLocation(palworld!, "win32")).toBe(
        "Pal/Saved/SaveGames"
      );
    } finally {
      db.close();
    }
  });
});
