import { a2sQueryAdapter } from "../../../main/gameQuery/adapters/a2sQueryAdapter";
import { ensureDefaultGameQueryAdapters } from "../../../main/gameQuery/ensureDefaultAdapters";
import {
  getGameQueryAdapter,
  registerGameQueryAdapter,
  resetGameQueryAdaptersForTests,
} from "../../../main/gameQuery/registry";
import type { GameQueryAdapter } from "../../../main/gameQuery/types";

const stubAdapter: GameQueryAdapter = {
  id: "a2s",
  extractTarget: () => ({ host: "10.0.0.9", port: 1 }),
  querySnapshot: () =>
    Promise.resolve({ success: false, errorKind: "parse", error: "stub" }),
};

describe("game query adapter registry (042.2)", () => {
  afterEach(() => {
    resetGameQueryAdaptersForTests();
  });

  it("resolves registered adapters by id and null for unknown ids", () => {
    registerGameQueryAdapter(a2sQueryAdapter);
    expect(getGameQueryAdapter("a2s")).toBe(a2sQueryAdapter);
    expect(getGameQueryAdapter("palworld")).toBeNull();
  });

  it("registers the built-in A2S adapter and heals after a registry reset", () => {
    resetGameQueryAdaptersForTests();
    expect(getGameQueryAdapter("a2s")).toBeNull();

    ensureDefaultGameQueryAdapters();
    expect(getGameQueryAdapter("a2s")).toBe(a2sQueryAdapter);

    resetGameQueryAdaptersForTests();
    ensureDefaultGameQueryAdapters();
    expect(getGameQueryAdapter("a2s")).toBe(a2sQueryAdapter);
  });

  it("does not replace an adapter already registered under the default id", () => {
    registerGameQueryAdapter(stubAdapter);
    ensureDefaultGameQueryAdapters();
    expect(getGameQueryAdapter("a2s")).toBe(stubAdapter);
  });
});
