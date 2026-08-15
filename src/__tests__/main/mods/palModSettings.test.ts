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
