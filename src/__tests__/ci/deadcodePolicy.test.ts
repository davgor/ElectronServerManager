import { createRequire } from "module";

import {
  buildIgnoreFileContent,
  filterNewDeadExports,
  normalizeTsPruneLine,
  parseIgnoreLines,
} from "../../ci/deadcodePolicy";

const requireFromHere = createRequire(__filename);

describe("normalizeTsPruneLine", () => {
  it("strips non-word prefixes and trims", () => {
    expect(normalizeTsPruneLine("\u001b► src/foo.ts:3 - bar")).toBe(
      "src/foo.ts:3 - bar"
    );
    expect(normalizeTsPruneLine("  src/foo.ts:3 - bar  ")).toBe(
      "src/foo.ts:3 - bar"
    );
  });

  it("normalizes backslashes to forward slashes", () => {
    expect(normalizeTsPruneLine("src\\main\\foo.ts:12 - baz")).toBe(
      "src/main/foo.ts:12 - baz"
    );
  });

  it("drops trailing parenthetical notes like (used in module)", () => {
    expect(normalizeTsPruneLine("src/foo.ts:3 - bar (used in module)")).toBe(
      "src/foo.ts:3 - bar"
    );
  });

  it("removes a leading slash", () => {
    expect(normalizeTsPruneLine("/src/foo.ts:3 - bar")).toBe(
      "src/foo.ts:3 - bar"
    );
  });

  it("returns empty string for blank or noise-only input", () => {
    expect(normalizeTsPruneLine("")).toBe("");
    expect(normalizeTsPruneLine("   ")).toBe("");
  });
});

describe("parseIgnoreLines", () => {
  it("skips blank lines and # comments, normalizing entries", () => {
    const content = [
      "# Baseline ignore for ts-prune",
      "",
      "src/foo.ts:3 - bar",
      "  # another comment",
      "src\\main\\baz.ts:9 - qux (used in module)",
    ].join("\n");

    expect(parseIgnoreLines(content)).toEqual([
      "src/foo.ts:3 - bar",
      "src/main/baz.ts:9 - qux",
    ]);
  });

  it("returns an empty list for empty content", () => {
    expect(parseIgnoreLines("")).toEqual([]);
  });
});

describe("filterNewDeadExports", () => {
  it("returns only findings missing from the ignore baseline", () => {
    const findings = [
      "src/foo.ts:3 - bar",
      "src/new.ts:1 - fresh",
      "src/other.ts:7 - stale",
    ];
    const ignore = ["src/foo.ts:3 - bar", "src/other.ts:7 - stale"];

    expect(filterNewDeadExports(findings, ignore)).toEqual([
      "src/new.ts:1 - fresh",
    ]);
  });

  it("passes when every finding is baselined", () => {
    expect(
      filterNewDeadExports(["src/foo.ts:3 - bar"], ["src/foo.ts:3 - bar"])
    ).toEqual([]);
  });
});

describe("buildIgnoreFileContent", () => {
  it("writes a header, sorted deduped entries, and a trailing newline", () => {
    const content = buildIgnoreFileContent(
      ["src/z.ts:1 - z", "src/a.ts:1 - a", "src/z.ts:1 - z"],
      "2026-08-15"
    );

    const lines = content.split("\n");
    expect(lines[0]).toMatch(/^# Baseline ignore for ts-prune/);
    expect(content).toContain("npm run deadcode:refresh");
    expect(content).toContain("# Refreshed 2026-08-15 (2 entries)");
    const entryLines = lines.filter((line) => /^src\//.test(line));
    expect(entryLines).toEqual(["src/a.ts:1 - a", "src/z.ts:1 - z"]);
    expect(content.endsWith("\n")).toBe(true);
  });
});

describe("scripts/deadcode-check.cjs parity", () => {
  it("exposes the same normalize/filter behavior as src/ci/deadcodePolicy.ts", () => {
    const cjs = requireFromHere("../../../scripts/deadcode-check.cjs") as {
      normalizeTsPruneLine: typeof normalizeTsPruneLine;
      parseIgnoreLines: typeof parseIgnoreLines;
      filterNewDeadExports: typeof filterNewDeadExports;
    };

    const samples = [
      "src\\main\\foo.ts:12 - baz (used in module)",
      "/src/foo.ts:3 - bar",
      "   ",
    ];
    for (const sample of samples) {
      expect(cjs.normalizeTsPruneLine(sample)).toBe(
        normalizeTsPruneLine(sample)
      );
    }

    const ignoreContent = "# c\nsrc/foo.ts:3 - bar\n";
    expect(cjs.parseIgnoreLines(ignoreContent)).toEqual(
      parseIgnoreLines(ignoreContent)
    );

    const findings = ["src/foo.ts:3 - bar", "src/new.ts:1 - fresh"];
    const ignore = ["src/foo.ts:3 - bar"];
    expect(cjs.filterNewDeadExports(findings, ignore)).toEqual(
      filterNewDeadExports(findings, ignore)
    );
  });

  it("scripts/deadcode-refresh.cjs builds identical baseline content", () => {
    const cjs = requireFromHere("../../../scripts/deadcode-refresh.cjs") as {
      buildIgnoreFileContent: typeof buildIgnoreFileContent;
    };

    const findings = ["src/z.ts:1 - z", "src/a.ts:1 - a"];
    expect(cjs.buildIgnoreFileContent(findings, "2026-08-15")).toBe(
      buildIgnoreFileContent(findings, "2026-08-15")
    );
  });
});
