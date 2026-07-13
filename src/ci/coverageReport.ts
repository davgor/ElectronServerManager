/**
 * Pure helpers for PR coverage comments (before/after + new-line coverage).
 * Keep `.github/scripts/coverage-report-policy.cjs` aligned with this module.
 */

export const COVERAGE_COMMENT_MARKER = "<!-- coverage-report-sticky -->";

interface CoverageMetric {
  total: number;
  covered: number;
  pct: number;
}

export interface CoverageTotals {
  lines: CoverageMetric;
  statements: CoverageMetric;
  functions: CoverageMetric;
  branches: CoverageMetric;
}

type MetricKey = keyof CoverageTotals;

interface MetricDeltas {
  lines: number;
  statements: number;
  functions: number;
  branches: number;
}

interface FileNewLineCoverage {
  file: string;
  covered: number;
  total: number;
  uncoveredLines: number[];
}

interface NewLineCoverage {
  covered: number;
  total: number;
  pct: number;
  files: FileNewLineCoverage[];
}

type LcovHitMap = Record<string, Map<number, number>>;

interface JestMetric {
  total?: number;
  covered?: number;
  pct?: number;
}

function parseMetric(raw: unknown, label: string): CoverageMetric {
  if (raw === null || typeof raw !== "object") {
    throw new Error(`coverage-summary missing metric: ${label}`);
  }
  const m = raw as JestMetric;
  return {
    total: Number(m.total ?? 0),
    covered: Number(m.covered ?? 0),
    pct: Number(m.pct ?? 0),
  };
}

export function parseCoverageSummary(summary: unknown): CoverageTotals {
  if (summary === null || typeof summary !== "object") {
    throw new Error("coverage-summary must be an object");
  }
  const root = summary as Record<string, unknown>;
  const total = root.total;
  if (total === null || typeof total !== "object") {
    throw new Error("coverage-summary missing total block");
  }
  const t = total as Record<string, unknown>;
  return {
    lines: parseMetric(t.lines, "lines"),
    statements: parseMetric(t.statements, "statements"),
    functions: parseMetric(t.functions, "functions"),
    branches: parseMetric(t.branches, "branches"),
  };
}

export function computeMetricDeltas(
  before: CoverageTotals,
  after: CoverageTotals
): MetricDeltas {
  return {
    lines: after.lines.pct - before.lines.pct,
    statements: after.statements.pct - before.statements.pct,
    functions: after.functions.pct - before.functions.pct,
    branches: after.branches.pct - before.branches.pct,
  };
}

/** Normalize Istanbul/Jest SF paths to repo-relative `src/...` when possible. */
function normalizeSourcePath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  const idx = normalized.lastIndexOf("/src/");
  if (idx !== -1) {
    return normalized.slice(idx + 1);
  }
  if (normalized.startsWith("src/")) {
    return normalized;
  }
  return normalized;
}

export function parseLcov(lcovText: string): LcovHitMap {
  const result: LcovHitMap = {};
  let currentFile: string | null = null;
  let currentHits: Map<number, number> | null = null;

  for (const rawLine of lcovText.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.startsWith("SF:")) {
      currentFile = normalizeSourcePath(line.slice(3));
      currentHits = new Map();
      continue;
    }
    if (
      line.startsWith("DA:") &&
      currentFile !== null &&
      currentHits !== null
    ) {
      const payload = line.slice(3);
      const [lineStr, hitStr] = payload.split(",");
      const lineNum = Number(lineStr);
      const hits = Number(hitStr);
      if (Number.isFinite(lineNum) && Number.isFinite(hits)) {
        currentHits.set(lineNum, hits);
      }
      continue;
    }
    if (
      line === "end_of_record" &&
      currentFile !== null &&
      currentHits !== null
    ) {
      result[currentFile] = currentHits;
      currentFile = null;
      currentHits = null;
    }
  }

  return result;
}

/**
 * Parse `git diff --unified=0` output into added line numbers per new-path file.
 */
export function parseUnifiedDiffAddedLines(
  diffText: string
): Record<string, number[]> {
  const result: Record<string, number[]> = {};
  let currentFile: string | null = null;
  let nextNewLine: number | null = null;

  for (const rawLine of diffText.split(/\r?\n/)) {
    if (rawLine.startsWith("+++ ")) {
      const pathPart = rawLine.slice(4).trim();
      if (pathPart === "/dev/null") {
        currentFile = null;
        nextNewLine = null;
        continue;
      }
      currentFile = normalizeSourcePath(
        pathPart.startsWith("b/") ? pathPart.slice(2) : pathPart
      );
      if (!(currentFile in result)) {
        result[currentFile] = [];
      }
      nextNewLine = null;
      continue;
    }

    const hunk =
      /^@@\s+-([0-9]+)(?:,([0-9]+))?\s+\+([0-9]+)(?:,([0-9]+))?\s+@@/.exec(
        rawLine
      );
    if (hunk) {
      nextNewLine = Number(hunk[3]);
      continue;
    }

    if (currentFile === null || nextNewLine === null) {
      continue;
    }

    if (rawLine.startsWith("+") && !rawLine.startsWith("+++")) {
      result[currentFile].push(nextNewLine);
      nextNewLine += 1;
      continue;
    }

    if (rawLine.startsWith("-") && !rawLine.startsWith("---")) {
      // Deletion only affects the old side; new-line cursor unchanged.
      continue;
    }

    if (rawLine.startsWith(" ") || rawLine === "") {
      nextNewLine += 1;
    }
  }

  return result;
}

/** Align with jest.config.js collectCoverageFrom exclusions. */
export function isCoverageCollectPath(filePath: string): boolean {
  const p = filePath.replace(/\\/g, "/");
  if (!p.startsWith("src/")) {
    return false;
  }
  if (!/\.(ts|tsx)$/.test(p)) {
    return false;
  }
  if (p.endsWith(".d.ts")) {
    return false;
  }
  if (p.includes("/__tests__/")) {
    return false;
  }
  if (p === "src/main/main.ts" || p === "src/renderer/main.tsx") {
    return false;
  }
  return true;
}

export function computeNewLineCoverage(
  addedLinesByFile: Record<string, number[]>,
  hitMap: LcovHitMap
): NewLineCoverage {
  const files: FileNewLineCoverage[] = [];
  let covered = 0;
  let total = 0;

  const fileNames = Object.keys(addedLinesByFile).sort();
  for (const file of fileNames) {
    if (!isCoverageCollectPath(file)) {
      continue;
    }
    if (!(file in hitMap)) {
      continue;
    }
    const hits = hitMap[file];

    const uncoveredLines: number[] = [];
    let fileCovered = 0;
    let fileTotal = 0;

    for (const line of addedLinesByFile[file]) {
      if (!hits.has(line)) {
        continue;
      }
      fileTotal += 1;
      const hitCount = hits.get(line) ?? 0;
      if (hitCount > 0) {
        fileCovered += 1;
      } else {
        uncoveredLines.push(line);
      }
    }

    if (fileTotal === 0) {
      continue;
    }

    covered += fileCovered;
    total += fileTotal;
    files.push({
      file,
      covered: fileCovered,
      total: fileTotal,
      uncoveredLines,
    });
  }

  const pct = total === 0 ? 100 : (covered / total) * 100;
  return { covered, total, pct, files };
}

function formatPct(pct: number): string {
  return `${pct.toFixed(2)}%`;
}

function formatDelta(delta: number): string {
  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta.toFixed(2)}`;
}

const METRIC_LABELS: { key: MetricKey; label: string }[] = [
  { key: "statements", label: "Statements" },
  { key: "branches", label: "Branches" },
  { key: "functions", label: "Functions" },
  { key: "lines", label: "Lines" },
];

const MAX_UNCOVERED_FILE_ROWS = 15;

interface BuildCoverageMarkdownInput {
  before: CoverageTotals | null;
  after: CoverageTotals;
  newLines: NewLineCoverage;
  baseSha: string;
  headSha: string;
}

export function buildCoverageMarkdown(
  input: BuildCoverageMarkdownInput
): string {
  const { before, after, newLines, baseSha, headSha } = input;
  const lines: string[] = [
    COVERAGE_COMMENT_MARKER,
    "## Coverage Report",
    "",
    `Comparing \`${baseSha.slice(0, 7)}\` → \`${headSha.slice(0, 7)}\`.`,
    "",
  ];

  if (before === null) {
    lines.push(
      "_Base coverage unavailable — showing head totals and new-line coverage only._",
      ""
    );
  }

  lines.push("| Metric | Before | After | Δ |", "| --- | ---: | ---: | ---: |");

  for (const { key, label } of METRIC_LABELS) {
    const afterMetric = after[key];
    if (before === null) {
      lines.push(`| ${label} | — | ${formatPct(afterMetric.pct)} | — |`);
    } else {
      const delta = afterMetric.pct - before[key].pct;
      lines.push(
        `| ${label} | ${formatPct(before[key].pct)} | ${formatPct(afterMetric.pct)} | ${formatDelta(delta)} |`
      );
    }
  }

  lines.push(
    "",
    "### New / changed lines",
    "",
    newLines.total === 0
      ? "_No new executable lines in coverage collect paths._"
      : `**${formatPct(newLines.pct)}** of new/changed lines covered (${newLines.covered}/${newLines.total}).`
  );

  const uncoveredFiles = newLines.files.filter(
    (f) => f.uncoveredLines.length > 0
  );
  if (uncoveredFiles.length > 0) {
    lines.push(
      "",
      "| File | Covered | Uncovered lines |",
      "| --- | ---: | --- |"
    );
    for (const file of uncoveredFiles.slice(0, MAX_UNCOVERED_FILE_ROWS)) {
      const uncovered =
        file.uncoveredLines.length > 20
          ? `${file.uncoveredLines.slice(0, 20).join(", ")}…`
          : file.uncoveredLines.join(", ");
      lines.push(
        `| \`${file.file}\` | ${file.covered}/${file.total} | ${uncovered} |`
      );
    }
    if (uncoveredFiles.length > MAX_UNCOVERED_FILE_ROWS) {
      lines.push(
        "",
        `_…and ${uncoveredFiles.length - MAX_UNCOVERED_FILE_ROWS} more files with uncovered new lines._`
      );
    }
  }

  lines.push("");
  return lines.join("\n");
}
