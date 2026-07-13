#!/usr/bin/env node
/**
 * Build a sticky PR coverage comment from base/head coverage artifacts + git diff.
 * Invoked by .github/workflows/coverage-report.yml.
 *
 * Env:
 *   GITHUB_REPOSITORY / GH_TOKEN (via gh)
 *   PR_NUMBER
 *   BASE_SHA
 *   HEAD_SHA
 *   HEAD_SUMMARY_PATH  — path to head coverage-summary.json (required)
 *   BASE_SUMMARY_PATH  — path to base coverage-summary.json (optional)
 *   HEAD_LCOV_PATH     — path to head lcov.info (required)
 *   DIFF_PATH          — path to unified=0 diff file (required)
 */
const fs = require("fs");
const { execFileSync } = require("child_process");
const {
  COVERAGE_COMMENT_MARKER,
  parseCoverageSummary,
  parseLcov,
  parseUnifiedDiffAddedLines,
  computeNewLineCoverage,
  buildCoverageMarkdown,
} = require("./coverage-report-policy.cjs");

function readJson(path) {
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

function readText(path) {
  return fs.readFileSync(path, "utf8");
}

function listIssueComments(repo, prNumber) {
  const out = execFileSync(
    "gh",
    [
      "api",
      "--paginate",
      `repos/${repo}/issues/${prNumber}/comments`,
    ],
    { encoding: "utf8", env: process.env }
  );
  // --paginate may concatenate JSON arrays; normalize
  const trimmed = out.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[")) {
    // Multiple pages look like `][` when concatenated by some tools;
    // gh --paginate usually outputs a stream of JSON arrays.
    try {
      return JSON.parse(trimmed);
    } catch {
      const merged = [];
      for (const chunk of trimmed.split(/\n(?=\[)/)) {
        const part = chunk.trim();
        if (!part) continue;
        merged.push(...JSON.parse(part));
      }
      return merged;
    }
  }
  return JSON.parse(trimmed);
}

function main() {
  const repo = process.env.GITHUB_REPOSITORY || "";
  const prNumber = process.env.PR_NUMBER || "";
  const baseSha = process.env.BASE_SHA || "";
  const headSha = process.env.HEAD_SHA || "";
  const headSummaryPath = process.env.HEAD_SUMMARY_PATH || "";
  const baseSummaryPath = process.env.BASE_SUMMARY_PATH || "";
  const headLcovPath = process.env.HEAD_LCOV_PATH || "";
  const diffPath = process.env.DIFF_PATH || "";

  if (!repo || !prNumber || !baseSha || !headSha) {
    console.error("Missing GITHUB_REPOSITORY, PR_NUMBER, BASE_SHA, or HEAD_SHA");
    process.exit(1);
  }
  if (!headSummaryPath || !headLcovPath || !diffPath) {
    console.error("Missing HEAD_SUMMARY_PATH, HEAD_LCOV_PATH, or DIFF_PATH");
    process.exit(1);
  }

  const after = parseCoverageSummary(readJson(headSummaryPath));
  let before = null;
  if (baseSummaryPath && fs.existsSync(baseSummaryPath)) {
    try {
      before = parseCoverageSummary(readJson(baseSummaryPath));
    } catch (err) {
      console.warn(
        "Failed to parse base coverage summary:",
        err instanceof Error ? err.message : err
      );
    }
  }

  const hitMap = parseLcov(readText(headLcovPath));
  const added = parseUnifiedDiffAddedLines(readText(diffPath));
  const newLines = computeNewLineCoverage(added, hitMap);

  const body = buildCoverageMarkdown({
    before,
    after,
    newLines,
    baseSha,
    headSha,
  });

  const comments = listIssueComments(repo, prNumber);
  const existing = comments.find(
    (c) => typeof c.body === "string" && c.body.includes(COVERAGE_COMMENT_MARKER)
  );

  if (existing) {
    execFileSync(
      "gh",
      [
        "api",
        "-X",
        "PATCH",
        `repos/${repo}/issues/comments/${existing.id}`,
        "--input",
        "-",
      ],
      {
        encoding: "utf8",
        env: process.env,
        input: JSON.stringify({ body }),
        stdio: ["pipe", "inherit", "inherit"],
      }
    );
    console.log(`Updated sticky coverage comment ${existing.id}`);
  } else {
    execFileSync(
      "gh",
      [
        "api",
        "-X",
        "POST",
        `repos/${repo}/issues/${prNumber}/comments`,
        "--input",
        "-",
      ],
      {
        encoding: "utf8",
        env: process.env,
        input: JSON.stringify({ body }),
        stdio: ["pipe", "inherit", "inherit"],
      }
    );
    console.log("Created sticky coverage comment");
  }
}

main();
