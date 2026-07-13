import { createRequire } from "module";

import {
  COVERAGE_COMMENT_MARKER,
  buildCoverageMarkdown,
  computeMetricDeltas,
  computeNewLineCoverage,
  isCoverageCollectPath,
  parseCoverageSummary,
  parseLcov,
  parseUnifiedDiffAddedLines,
} from "../../ci/coverageReport";
import type { CoverageTotals } from "../../ci/coverageReport";

const requireFromHere = createRequire(__filename);

describe("parseCoverageSummary", () => {
  it("parses Jest coverage-summary.json totals", () => {
    const summary = {
      total: {
        lines: { total: 100, covered: 80, skipped: 0, pct: 80 },
        statements: { total: 200, covered: 150, skipped: 0, pct: 75 },
        functions: { total: 40, covered: 30, skipped: 0, pct: 75 },
        branches: { total: 50, covered: 25, skipped: 0, pct: 50 },
      },
    };

    expect(parseCoverageSummary(summary)).toEqual({
      lines: { total: 100, covered: 80, pct: 80 },
      statements: { total: 200, covered: 150, pct: 75 },
      functions: { total: 40, covered: 30, pct: 75 },
      branches: { total: 50, covered: 25, pct: 50 },
    });
  });

  it("throws on missing total block", () => {
    expect(() => parseCoverageSummary({})).toThrow(/total/i);
  });
});

describe("computeMetricDeltas", () => {
  it("subtracts before pct from after pct", () => {
    const before: CoverageTotals = {
      lines: { total: 100, covered: 70, pct: 70 },
      statements: { total: 100, covered: 70, pct: 70 },
      functions: { total: 10, covered: 8, pct: 80 },
      branches: { total: 20, covered: 10, pct: 50 },
    };
    const after: CoverageTotals = {
      lines: { total: 110, covered: 88, pct: 80 },
      statements: { total: 110, covered: 82.5, pct: 75 },
      functions: { total: 12, covered: 9, pct: 75 },
      branches: { total: 22, covered: 12.1, pct: 55 },
    };

    expect(computeMetricDeltas(before, after)).toEqual({
      lines: 10,
      statements: 5,
      functions: -5,
      branches: 5,
    });
  });
});

describe("parseLcov", () => {
  it("maps file paths to line hit counts", () => {
    const lcov = `
TN:
SF:src/main/foo.ts
DA:1,1
DA:2,0
DA:5,3
end_of_record
SF:src/renderer/bar.tsx
DA:10,1
end_of_record
`.trim();

    expect(parseLcov(lcov)).toEqual({
      "src/main/foo.ts": new Map([
        [1, 1],
        [2, 0],
        [5, 3],
      ]),
      "src/renderer/bar.tsx": new Map([[10, 1]]),
    });
  });

  it("normalizes absolute SF paths to repo-relative src paths", () => {
    const lcov = `
SF:/home/runner/work/app/app/src/main/foo.ts
DA:1,1
end_of_record
`.trim();

    expect(parseLcov(lcov)["src/main/foo.ts"].get(1)).toBe(1);
  });
});

describe("parseUnifiedDiffAddedLines", () => {
  it("collects added line numbers per file", () => {
    const diff = `
diff --git a/src/main/foo.ts b/src/main/foo.ts
index 111..222 100644
--- a/src/main/foo.ts
+++ b/src/main/foo.ts
@@ -10,0 +11,2 @@
+const a = 1;
+const b = 2;
@@ -20 +22 @@
+const c = 3;
diff --git a/src/__tests__/foo.test.ts b/src/__tests__/foo.test.ts
--- a/src/__tests__/foo.test.ts
+++ b/src/__tests__/foo.test.ts
@@ -1,0 +2 @@
+it("x", () => {});
`.trim();

    expect(parseUnifiedDiffAddedLines(diff)).toEqual({
      "src/main/foo.ts": [11, 12, 22],
      "src/__tests__/foo.test.ts": [2],
    });
  });
});

describe("isCoverageCollectPath", () => {
  it("matches jest collectCoverageFrom rules", () => {
    expect(isCoverageCollectPath("src/main/steamCmd.ts")).toBe(true);
    expect(isCoverageCollectPath("src/renderer/App.tsx")).toBe(true);
    expect(isCoverageCollectPath("src/main/main.ts")).toBe(false);
    expect(isCoverageCollectPath("src/renderer/main.tsx")).toBe(false);
    expect(isCoverageCollectPath("src/__tests__/main/steamCmd.test.ts")).toBe(
      false
    );
    expect(isCoverageCollectPath("src/types/ipc.d.ts")).toBe(false);
    expect(isCoverageCollectPath("README.md")).toBe(false);
  });
});

describe("computeNewLineCoverage", () => {
  it("scores only added lines that appear in the head lcov map for collectible files", () => {
    const added = {
      "src/main/foo.ts": [11, 12, 13, 14],
      "src/__tests__/foo.test.ts": [2],
      "src/main/main.ts": [5],
    };
    const hits = {
      "src/main/foo.ts": new Map([
        [11, 1],
        [12, 0],
        [13, 2],
        // 14 absent from map → ignored
      ]),
    };

    const result = computeNewLineCoverage(added, hits);
    expect(result.covered).toBe(2);
    expect(result.total).toBe(3);
    expect(result.pct).toBeCloseTo((2 / 3) * 100);
    expect(result.files).toEqual([
      {
        file: "src/main/foo.ts",
        covered: 2,
        total: 3,
        uncoveredLines: [12],
      },
    ]);
  });
});

describe("buildCoverageMarkdown", () => {
  it("renders before/after tables, new-line coverage, and sticky marker", () => {
    const before: CoverageTotals = {
      lines: { total: 100, covered: 70, pct: 70 },
      statements: { total: 100, covered: 70, pct: 70 },
      functions: { total: 10, covered: 8, pct: 80 },
      branches: { total: 20, covered: 10, pct: 50 },
    };
    const after: CoverageTotals = {
      lines: { total: 110, covered: 88, pct: 80 },
      statements: { total: 110, covered: 82.5, pct: 75 },
      functions: { total: 12, covered: 9, pct: 75 },
      branches: { total: 22, covered: 12.1, pct: 55 },
    };
    const newLines = {
      covered: 2,
      total: 3,
      pct: (2 / 3) * 100,
      files: [
        {
          file: "src/main/foo.ts",
          covered: 2,
          total: 3,
          uncoveredLines: [12],
        },
      ],
    };

    const md = buildCoverageMarkdown({
      before,
      after,
      newLines,
      baseSha: "aaa1111",
      headSha: "bbb2222",
    });

    expect(md).toContain(COVERAGE_COMMENT_MARKER);
    expect(md).toContain("Coverage Report");
    expect(md).toContain("aaa1111");
    expect(md).toContain("bbb2222");
    expect(md).toContain("70.00%");
    expect(md).toContain("80.00%");
    expect(md).toContain("+10.00");
    expect(md).toContain("New / changed lines");
    expect(md).toContain("src/main/foo.ts");
    expect(md).toContain("12");
  });

  it("notes when base coverage is missing", () => {
    const after: CoverageTotals = {
      lines: { total: 10, covered: 10, pct: 100 },
      statements: { total: 10, covered: 10, pct: 100 },
      functions: { total: 1, covered: 1, pct: 100 },
      branches: { total: 0, covered: 0, pct: 100 },
    };
    const md = buildCoverageMarkdown({
      before: null,
      after,
      newLines: { covered: 0, total: 0, pct: 100, files: [] },
      baseSha: "aaa",
      headSha: "bbb",
    });
    expect(md).toMatch(/base coverage unavailable/i);
  });
});

describe("coverage-report-policy.cjs sync", () => {
  it("exports the same sticky marker as the TypeScript module", () => {
    const cjs = requireFromHere(
      "../../../.github/scripts/coverage-report-policy.cjs"
    ) as {
      COVERAGE_COMMENT_MARKER: string;
      parseCoverageSummary: typeof parseCoverageSummary;
    };
    expect(cjs.COVERAGE_COMMENT_MARKER).toBe(COVERAGE_COMMENT_MARKER);
    expect(
      cjs.parseCoverageSummary({
        total: {
          lines: { total: 1, covered: 1, pct: 100 },
          statements: { total: 1, covered: 1, pct: 100 },
          functions: { total: 1, covered: 1, pct: 100 },
          branches: { total: 0, covered: 0, pct: 100 },
        },
      }).lines.pct
    ).toBe(100);
  });
});
