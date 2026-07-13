import fs from "fs";
import path from "path";

describe("electron-builder artifact names", () => {
  it("uses space-free artifactName patterns so GitHub Releases match latest.yml", () => {
    const configPath = path.join(__dirname, "../../../electron-builder.json");
    const config = JSON.parse(fs.readFileSync(configPath, "utf8")) as {
      artifactName?: string;
      nsis?: { artifactName?: string };
      portable?: { artifactName?: string };
      linux?: { artifactName?: string };
    };

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
});
