import {
  getGameRestAdapter,
  registerGameRestAdapter,
  resetGameRestAdaptersForTests,
} from "../../../main/gameRest/registry";
import { palworldRestAdapter } from "../../../main/gameRest/adapters/palworldRestAdapter";
import {
  ensureDefaultGameRestAdapters,
  resetDefaultGameRestAdaptersForTests,
} from "../../../main/gameRest/ensureDefaultAdapters";
import type { GameRestAdapter } from "../../../main/gameRest/types";

describe("game REST adapter registry (039.2)", () => {
  afterEach(() => {
    resetGameRestAdaptersForTests();
    resetDefaultGameRestAdaptersForTests();
  });

  it("registers and resolves the Palworld adapter by id", () => {
    registerGameRestAdapter(palworldRestAdapter);
    expect(getGameRestAdapter("palworld")).toBe(palworldRestAdapter);
    expect(getGameRestAdapter("missing")).toBeNull();
  });

  it("ensureDefaultGameRestAdapters registers Palworld once", () => {
    ensureDefaultGameRestAdapters();
    ensureDefaultGameRestAdapters();
    expect(getGameRestAdapter("palworld")?.id).toBe("palworld");
  });

  it("allows a second adapter id to be registered without touching Palworld", () => {
    ensureDefaultGameRestAdapters();
    const stub: GameRestAdapter = {
      id: "fictional",
      extractConfig: () => ({
        enabled: false,
        port: 1,
        adminPassword: "",
      }),
      call: () => Promise.resolve({ success: false, error: "stub" }),
    };
    registerGameRestAdapter(stub);
    expect(getGameRestAdapter("fictional")).toBe(stub);
    expect(getGameRestAdapter("palworld")?.id).toBe("palworld");
  });
});
