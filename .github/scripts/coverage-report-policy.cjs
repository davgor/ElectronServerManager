/**
 * Keep in sync with src/ci/coverageReport.ts.
 * Pure helpers for PR coverage comments (before/after + new-line coverage).
 */

const COVERAGE_COMMENT_MARKER = "<!-- coverage-report-sticky -->";
const MAX_UNCOVERED_FILE_ROWS = 15;

const METRIC_LABELS = [
  { key: "statements", label: "Statements" },
  { key: "branches", label: "Branches" },
  { key: "functions", label: "Functions" },
  { key: "lines", label: "Lines" },
];

function parseMetric(raw, label) {
  if (raw === null || typeof raw !== "object") {
    throw new Error(`coverage-summary missing metric: ${label}`);
  }
  return {
    total: Number(raw.total ?? 0),
    covered: Number(raw.covered ?? 0),
    pct: Number(raw.pct ?? 0),
  };
}

function parseCoverageSummary(summary) {
  if (summary === null || typeof summary !== "object") {
    throw new Error("coverage-summary must be an object");
  }
  const total = summary.total;
  if (total === null || typeof total !== "object") {
    throw new Error("coverage-summary missing total block");
  }
  return {
    lines: parseMetric(total.lines, "lines"),
    statements: parseMetric(total.statements, "statements"),
    functions: parseMetric(total.functions, "functions"),
    branches: parseMetric(total.branches, "branches"),
  };
}

function computeMetricDeltas(before, after) {
  return {
    lines: after.lines.pct - before.lines.pct,
    statements: after.statements.pct - before.statements.pct,
    functions: after.functions.pct - before.functions.pct,
    branches: after.branches.pct - before.branches.pct,
  };
}

function normalizeSourcePath(filePath) {
  const normalized = String(filePath || "").replace(/\\/g, "/");
  const idx = normalized.lastIndexOf("/src/");
  if (idx !== -1) {
    return normalized.slice(idx + 1);
  }
  if (normalized.startsWith("src/")) {
    return normalized;
  }
  return normalized;
}

function parseLcov(lcovText) {
  const result = {};
  let currentFile = null;
  let currentHits = null;

  for (const rawLine of String(lcovText || "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.startsWith("SF:")) {
      currentFile = normalizeSourcePath(line.slice(3));
      currentHits = new Map();
      continue;
    }
    if (line.startsWith("DA:") && currentFile && currentHits) {
      const payload = line.slice(3);
      const [lineStr, hitStr] = payload.split(",");
      const lineNum = Number(lineStr);
      const hits = Number(hitStr);
      if (Number.isFinite(lineNum) && Number.isFinite(hits)) {
        currentHits.set(lineNum, hits);
      }
      continue;
    }
    if (line === "end_of_record" && currentFile && currentHits) {
      result[currentFile] = currentHits;
      currentFile = null;
      currentHits = null;
    }
  }

  return result;
}

function parseUnifiedDiffAddedLines(diffText) {
  const result = {};
  let currentFile = null;
  let nextNewLine = null;

  for (const rawLine of String(diffText || "").split(/\r?\n/)) {
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
      if (!result[currentFile]) {
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

    if (!currentFile || nextNewLine === null) {
      continue;
    }

    if (rawLine.startsWith("+") && !rawLine.startsWith("+++")) {
      result[currentFile].push(nextNewLine);
      nextNewLine += 1;
      continue;
    }

    if (rawLine.startsWith("-") && !rawLine.startsWith("---")) {
      continue;
    }

    if (rawLine.startsWith(" ") || rawLine === "") {
      nextNewLine += 1;
    }
  }

  return result;
}

function isCoverageCollectPath(filePath) {
  const p = String(filePath || "").replace(/\\/g, "/");
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

function computeNewLineCoverage(addedLinesByFile, hitMap) {
  const files = [];
  let covered = 0;
  let total = 0;

  const fileNames = Object.keys(addedLinesByFile || {}).sort();
  for (const file of fileNames) {
    if (!isCoverageCollectPath(file)) {
      continue;
    }
    const hits = hitMap[file];
    if (!hits) {
      continue;
    }

    const uncoveredLines = [];
    let fileCovered = 0;
    let fileTotal = 0;

    for (const line of addedLinesByFile[file]) {
      if (!hits.has(line)) {
        continue;
      }
      fileTotal += 1;
      const hitCount = hits.get(line) || 0;
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

function formatPct(pct) {
  return `${Number(pct).toFixed(2)}%`;
}

function formatDelta(delta) {
  const sign = delta > 0 ? "+" : "";
  return `${sign}${Number(delta).toFixed(2)}`;
}

function buildCoverageMarkdown(input) {
  const { before, after, newLines, baseSha, headSha } = input;
  const lines = [
    COVERAGE_COMMENT_MARKER,
    "## Coverage Report",
    "",
    `Comparing \`${String(baseSha).slice(0, 7)}\` → \`${String(headSha).slice(0, 7)}\`.`,
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

  const uncoveredFiles = (newLines.files || []).filter(
    (f) => f.uncoveredLines && f.uncoveredLines.length > 0
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

module.exports = {
  COVERAGE_COMMENT_MARKER,
  parseCoverageSummary,
  computeMetricDeltas,
  normalizeSourcePath,
  parseLcov,
  parseUnifiedDiffAddedLines,
  isCoverageCollectPath,
  computeNewLineCoverage,
  buildCoverageMarkdown,
};
