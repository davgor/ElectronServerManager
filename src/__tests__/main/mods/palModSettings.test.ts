import {
  addActiveMod,
  listActiveMods,
  readPalModSettings,
  removeActiveMod,
  writePalModSettings,
} from "../../../main/mods/palModSettings";

describe("palModSettings", () => {
  it("creates default settings with global enable and ActiveModList lines", () => {
    const next = addActiveMod("", "FastWorkPals");
    expect(next).toContain("[PalModSettings]");
    expect(next).toContain("bGlobalEnableMod=true");
    expect(next).toContain("ActiveModList=FastWorkPals");
    expect(listActiveMods(next)).toEqual(["FastWorkPals"]);
  });

  it("preserves multiple ActiveModList entries (duplicate keys)", () => {
    let ini = addActiveMod("", "ModA");
    ini = addActiveMod(ini, "ModB");
    expect(listActiveMods(ini)).toEqual(["ModA", "ModB"]);
    expect(ini.match(/ActiveModList=/g)?.length).toBe(2);
  });

  it("is idempotent when adding an already-active package", () => {
    let ini = addActiveMod("", "ModA");
    ini = addActiveMod(ini, "ModA");
    expect(listActiveMods(ini)).toEqual(["ModA"]);
  });

  it("removes a package without dropping unrelated ActiveModList lines", () => {
    let ini = addActiveMod("", "ModA");
    ini = addActiveMod(ini, "ModB");
    ini = removeActiveMod(ini, "ModA");
    expect(listActiveMods(ini)).toEqual(["ModB"]);
    expect(ini).toContain("bGlobalEnableMod=true");
  });

  it("preserves preamble and unknown section lines", () => {
    const original = `; comment
[Other]
x=1
[PalModSettings]
bGlobalEnableMod=false
ActiveModList=KeepMe
WorkshopRootDir=C:\\mods
`;
    const next = addActiveMod(original, "Added");
    expect(next).toContain("WorkshopRootDir=C:\\mods");
    expect(listActiveMods(next)).toEqual(["KeepMe", "Added"]);
    expect(readPalModSettings(next).globalEnable).toBe(true);
    const parsed = readPalModSettings(original);
    expect(parsed.preamble).toContain("; comment");
    expect(parsed.preamble).toContain("[Other]");
    expect(parsed.preamble).not.toContain("[PalModSettings]");
    expect(parsed.activeMods).toEqual(["KeepMe"]);
  });

  it("omits preamble separator when preamble is empty or whitespace", () => {
    const empty = writePalModSettings({
      globalEnable: true,
      activeMods: ["A"],
      otherSectionLines: [],
      preamble: "",
    });
    expect(empty.startsWith("[PalModSettings]")).toBe(true);
    expect(empty).not.toMatch(/^\s+\n\[PalModSettings]/);

    const whitespace = writePalModSettings({
      globalEnable: false,
      activeMods: [],
      otherSectionLines: [],
      preamble: "   \n  ",
    });
    expect(whitespace.startsWith("[PalModSettings]")).toBe(true);
    expect(whitespace).toContain("bGlobalEnableMod=false");
  });

  it("keeps non-empty preamble above the PalModSettings section", () => {
    const written = writePalModSettings({
      globalEnable: true,
      activeMods: ["Z"],
      otherSectionLines: [],
      preamble: "; header\n[Prev]\nk=v",
    });
    expect(written.indexOf("; header")).toBeLessThan(
      written.indexOf("[PalModSettings]")
    );
    expect(written).toContain("[Prev]");
    expect(listActiveMods(written)).toEqual(["Z"]);
  });

  it("round-trips via read/write helpers", () => {
    const original = `[PalModSettings]
bGlobalEnableMod=true
ActiveModList=One
ActiveModList=Two
`;
    const parsed = readPalModSettings(original);
    expect(parsed.activeMods).toEqual(["One", "Two"]);
    expect(parsed.globalEnable).toBe(true);
    const written = writePalModSettings(parsed);
    expect(listActiveMods(written)).toEqual(["One", "Two"]);
  });
});
