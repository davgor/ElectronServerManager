import type { AppSettings } from "../../types/ipc";
import {
  getSettings,
  saveSettings,
  resetSettingsStoreForTests,
} from "../../main/settingsStore";

interface MockStoreBehavior {
  data: AppSettings | null;
  throwOnConstruct: boolean;
  throwOnWrite: boolean;
}

const mockStoreBehavior: MockStoreBehavior = {
  data: null,
  throwOnConstruct: false,
  throwOnWrite: false,
};

jest.mock("electron-store", () => {
  return jest.fn().mockImplementation((options: { defaults: AppSettings }) => {
    if (mockStoreBehavior.throwOnConstruct) {
      throw new Error("store unavailable");
    }
    if (mockStoreBehavior.data === null) {
      mockStoreBehavior.data = { ...options.defaults };
    }
    return {
      get store(): AppSettings {
        return mockStoreBehavior.data as AppSettings;
      },
      set store(value: AppSettings) {
        if (mockStoreBehavior.throwOnWrite) {
          throw new Error("disk write failed");
        }
        mockStoreBehavior.data = value;
      },
    };
  });
});

describe("settingsStore", () => {
  beforeEach(() => {
    mockStoreBehavior.data = null;
    mockStoreBehavior.throwOnConstruct = false;
    mockStoreBehavior.throwOnWrite = false;
    resetSettingsStoreForTests();
    jest.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("getSettings", () => {
    it("returns defaults when the store is empty", () => {
      const result = getSettings();

      expect(result).toEqual({
        success: true,
        settings: { servers: {} },
      });
    });

    it("returns success: false with defaults when the store fails", () => {
      mockStoreBehavior.throwOnConstruct = true;

      expect(() => getSettings()).not.toThrow();

      const result = getSettings();
      expect(result.success).toBe(false);
      expect(result.error).toBe("store unavailable");
      expect(result.settings).toEqual({ servers: {} });
    });
  });

  describe("saveSettings", () => {
    it("round-trips saved settings back through getSettings", () => {
      const settings: AppSettings = {
        selectedSteamPath: "/opt/steam",
        servers: {
          "1396110": {
            autoRestart: true,
            autoUpdate: false,
            backupPath: "/backups/valheim",
            backupIntervalSeconds: 300,
          },
        },
      };

      const saveResult = saveSettings(settings);
      expect(saveResult).toEqual({ success: true });

      const getResult = getSettings();
      expect(getResult.success).toBe(true);
      expect(getResult.settings).toEqual(settings);
    });

    it("returns success: false with an error message when writing fails", () => {
      mockStoreBehavior.throwOnWrite = true;

      const settings: AppSettings = { servers: {} };

      expect(() => saveSettings(settings)).not.toThrow();

      const result = saveSettings(settings);
      expect(result.success).toBe(false);
      expect(result.error).toBe("disk write failed");
    });
  });
});
