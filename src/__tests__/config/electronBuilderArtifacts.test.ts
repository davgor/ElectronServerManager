import fs from "fs";
import path from "path";

describe("electron-builder artifact names", () => {
  const configPath = path.join(__dirname, "../../../electron-builder.json");

  function readBuilderConfig(): {
    artifactName?: string;
    files?: string[];
    nsis?: {
      artifactName?: string;
      oneClick?: boolean;
      allowToChangeInstallationDirectory?: boolean;
      perMachine?: boolean;
    };
    portable?: { artifactName?: string };
    linux?: { artifactName?: string };
  } {
    return JSON.parse(fs.readFileSync(configPath, "utf8")) as {
      artifactName?: string;
      files?: string[];
      nsis?: {
        artifactName?: string;
        oneClick?: boolean;
        allowToChangeInstallationDirectory?: boolean;
        perMachine?: boolean;
      };
      portable?: { artifactName?: string };
      linux?: { artifactName?: string };
    };
  }

  it("uses space-free artifactName patterns so GitHub Releases match latest.yml", () => {
    const config = readBuilderConfig();

    const names = [
      config.artifactName,
      config.nsis?.artifactName,
      config.portable?.artifactName,
      config.linux?.artifactName,
    ].filter((value): value is string => typeof value === "string");

    expect(names.length).toBeGreaterThanOrEqual(3);
    for (const name of names) {
      expect(name).not.toMatch(/\s/);
      expect(name).toContain("${version}");
      expect(name).toContain("${ext}");
    }
  });

  it("packages dist/types so main runtime requires of shared constants resolve", () => {
    const config = readBuilderConfig();
    const files = config.files ?? [];

    expect(files).toEqual(
      expect.arrayContaining([
        "dist/main/**/*",
        "dist/preload/**/*",
        "dist/renderer/**/*",
        "dist/types/**/*",
      ])
    );
  });

  it("uses one-click NSIS so quitAndInstall(true) can stay silent (no assisted wizard)", () => {
    const config = readBuilderConfig();
    const nsis = config.nsis;

    expect(nsis).toBeDefined();
    expect(nsis?.oneClick).toBe(true);
    expect(nsis?.allowToChangeInstallationDirectory).toBeUndefined();
    expect(nsis?.perMachine).not.toBe(true);
  });
});
