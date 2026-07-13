import {
  filterConfigTree,
  normalizeQuery,
  valueMatches,
} from "../../renderer/configSearch";

describe("normalizeQuery", () => {
  it("trims and lowercases", () => {
    expect(normalizeQuery("  MaxPlayers  ")).toBe("maxplayers");
  });

  it("returns empty string for whitespace-only", () => {
    expect(normalizeQuery("   ")).toBe("");
  });
});

describe("valueMatches", () => {
  it("matches stringified primitives case-insensitively", () => {
    expect(valueMatches("Hello World", "hello")).toBe(true);
    expect(valueMatches(42, "42")).toBe(true);
    expect(valueMatches(true, "true")).toBe(true);
    expect(valueMatches("Hello", "xyz")).toBe(false);
  });

  it("matches nested object values and keys via recursion", () => {
    expect(valueMatches({ nested: { MaxPlayers: 8 } }, "maxplayers")).toBe(
      true
    );
    expect(valueMatches({ nested: { count: 8 } }, "8")).toBe(true);
    expect(valueMatches({ nested: { count: 8 } }, "missing")).toBe(false);
  });

  it("matches array element values", () => {
    expect(valueMatches(["pve", "friendly"], "friend")).toBe(true);
    expect(valueMatches(["pve"], "pvp")).toBe(false);
  });
});

describe("filterConfigTree", () => {
  const sample: Record<string, unknown> = {
    name: "My Dedicated Server",
    saveInterval: 300,
    enableVoiceChat: true,
    tags: ["pve", "friendly"],
    userGroups: {
      admin: { password: "secret", canKickBan: true },
      guest: { password: "guest", canKickBan: false },
    },
  };

  it("returns original config and empty expandPaths for empty query", () => {
    const result = filterConfigTree(sample, "");
    expect(result.filtered).toBe(sample);
    expect(result.expandPaths).toEqual([]);
  });

  it("filters by key match and keeps ancestors without non-matching siblings", () => {
    const result = filterConfigTree(sample, "canKickBan");
    expect(Object.keys(result.filtered)).toEqual(["userGroups"]);
    const groups = result.filtered.userGroups as Record<
      string,
      Record<string, unknown>
    >;
    expect(Object.keys(groups)).toEqual(["admin", "guest"]);
    expect(groups.admin).toEqual({ canKickBan: true });
    expect(groups.guest).toEqual({ canKickBan: false });
    expect(result.expandPaths).toEqual(
      expect.arrayContaining([
        "userGroups",
        "userGroups.admin",
        "userGroups.guest",
      ])
    );
  });

  it("filters by value match without non-matching siblings", () => {
    const result = filterConfigTree(sample, "secret");
    expect(Object.keys(result.filtered)).toEqual(["userGroups"]);
    const groups = result.filtered.userGroups as Record<
      string,
      Record<string, unknown>
    >;
    expect(Object.keys(groups)).toEqual(["admin"]);
    expect(groups.admin).toEqual({ password: "secret" });
  });

  it("does not keep non-matching siblings under a nested section (Palworld-like)", () => {
    const palworldLike: Record<string, unknown> = {
      "/Script/Pal.PalGameWorldSettings": {
        OptionSettings: {
          Difficulty: "None",
          RandomizerType: "None",
          RandomizerSeed: '""',
          DayTimeSpeedRate: 1,
        },
      },
    };
    const result = filterConfigTree(palworldLike, "diff");
    const script = result.filtered[
      "/Script/Pal.PalGameWorldSettings"
    ] as Record<string, unknown>;
    const options = script.OptionSettings as Record<string, unknown>;
    expect(Object.keys(options)).toEqual(["Difficulty"]);
    expect(options.Difficulty).toBe("None");
    expect(result.expandPaths).toEqual(
      expect.arrayContaining([
        "/Script/Pal.PalGameWorldSettings",
        "/Script/Pal.PalGameWorldSettings.OptionSettings",
      ])
    );
  });

  it("is case-insensitive", () => {
    const result = filterConfigTree(sample, "DEDICATED");
    expect(result.filtered).toEqual({ name: "My Dedicated Server" });
  });

  it("returns empty object when nothing matches", () => {
    const result = filterConfigTree(sample, "zzzz-no-match");
    expect(result.filtered).toEqual({});
    expect(result.expandPaths).toEqual([]);
  });

  it("matches array element values and expands the array path", () => {
    const result = filterConfigTree(sample, "friendly");
    expect(Object.keys(result.filtered)).toEqual(["tags"]);
    expect(result.filtered.tags).toEqual(["pve", "friendly"]);
    expect(result.expandPaths).toContain("tags");
  });

  it("includes a leaf when its key matches even if value does not", () => {
    const result = filterConfigTree(sample, "saveInterval");
    expect(result.filtered).toEqual({ saveInterval: 300 });
  });
});
