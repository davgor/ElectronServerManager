import {
  resolveZipDestination,
  type ZipEntryMeta,
} from "../../../main/mods/zipDestination";

function entries(...paths: string[]): ZipEntryMeta[] {
  return paths.map((path) => ({ path }));
}

describe("resolveZipDestination", () => {
  it("detects official workshop package from root Info.json", () => {
    const info = JSON.stringify({
      ModName: "Fast Work Pals",
      PackageName: "FastWorkPals",
      Version: "1.0.0",
      InstallRule: [{ Type: "Lua", IsServer: true, Targets: ["./Scripts"] }],
    });
    const result = resolveZipDestination(
      entries("Info.json", "Scripts/main.lua"),
      {
        "Info.json": Buffer.from(info, "utf8"),
      }
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.plan.kind).toBe("workshop");
    expect(result.plan.packageName).toBe("FastWorkPals");
    expect(result.plan.displayName).toBe("Fast Work Pals");
    expect(result.plan.files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          archivePath: "Info.json",
          relativeTarget: "Info.json",
        }),
        expect.objectContaining({
          archivePath: "Scripts/main.lua",
          relativeTarget: "Scripts/main.lua",
        }),
      ])
    );
  });

  it("strips a single wrapper folder around Info.json", () => {
    const info = JSON.stringify({
      ModName: "Wrapped",
      PackageName: "WrappedPkg",
    });
    const result = resolveZipDestination(
      entries("Wrapped/Info.json", "Wrapped/Scripts/a.lua"),
      { "Wrapped/Info.json": Buffer.from(info, "utf8") }
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.plan.kind).toBe("workshop");
    expect(result.plan.packageName).toBe("WrappedPkg");
    expect(result.plan.files.map((f) => f.relativeTarget)).toEqual(
      expect.arrayContaining(["Info.json", "Scripts/a.lua"])
    );
  });

  it("maps path-rooted Pal/ and Mods/ entries to install-relative targets", () => {
    const result = resolveZipDestination(
      entries(
        "Pal/Content/Paks/MyMod.pak",
        "Mods/NativeMods/UE4SS/Mods/Foo/enabled.txt"
      )
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.plan.kind).toBe("path_deploy");
    expect(result.plan.files).toEqual([
      {
        archivePath: "Pal/Content/Paks/MyMod.pak",
        relativeTarget: "Pal/Content/Paks/MyMod.pak",
      },
      {
        archivePath: "Mods/NativeMods/UE4SS/Mods/Foo/enabled.txt",
        relativeTarget: "Mods/NativeMods/UE4SS/Mods/Foo/enabled.txt",
      },
    ]);
  });

  it("strips a wrapper folder before path roots", () => {
    const result = resolveZipDestination(
      entries("SomeMod/Pal/Content/Paks/x.pak", "SomeMod/readme.txt")
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.plan.kind).toBe("path_deploy");
    expect(result.plan.files.map((f) => f.relativeTarget)).toEqual([
      "Pal/Content/Paks/x.pak",
    ]);
  });

  it("rejects empty archives", () => {
    const result = resolveZipDestination([]);
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error).toMatch(/empty/i);
  });

  it("rejects zip-slip path traversal", () => {
    const result = resolveZipDestination(entries("../evil.txt", "Pal/a.pak"));
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error).toMatch(/traversal|zip-slip|\.\./i);
  });

  it("rejects archives with no recognizable install layout", () => {
    const result = resolveZipDestination(entries("readme.txt", "docs/note.md"));
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error).toMatch(/recognize|destination|layout/i);
  });
});
