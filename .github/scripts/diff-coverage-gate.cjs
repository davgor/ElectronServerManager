#!/usr/bin/env node
/**
 * Fail CI if lines added/changed in this diff aren't covered by tests.
 *
 * Companion to `.github/workflows/coverage-report.yml` (informational PR
 * comment, never fails). This is the blocking counterpart: global coverage
 * thresholds (jest.config.js) hide gaps behind well-tested files' averages,
 * so this checks only the lines that changed -- new/edited code has to be
 * covered even while old gaps get paid down gradually as files are touched,
 * not via a backfill project.
 *
 * Reuses the pure diff/lcov parsing from coverage-report-policy.cjs rather
 * than re-implementing it, so the blocking gate and the informational
 * comment always agree on what "new-line coverage" means.
 *
 * Requires: coverage/lcov.info from `jest --coverage`, and enough git
 * history checked out to diff BASE_SHA..HEAD_SHA.
 *
 * Env:
 *   BASE_SHA                 — defaults to merge-base with origin/main or
 *                               origin/master (local/agent runs)
 *   HEAD_SHA                 — omit to diff against the working tree
 *   DIFF_COVERAGE_THRESHOLD  — percent, default 80
 *   LCOV_PATH                — default coverage/lcov.info
 */
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const {
  parseLcov,
  parseUnifiedDiffAddedLines,
  computeNewLineCoverage,
} = require("./coverage-report-policy.cjs");

const THRESHOLD = Number(process.env.DIFF_COVERAGE_THRESHOLD || 80);
const LCOV_PATH = process.env.LCOV_PATH || path.join("coverage", "lcov.info");

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" });
}

// Local/agent runs: no BASE_SHA given, so diff against the nearest of
// origin/main or origin/master (falls back to HEAD~1 for a repo with
// neither, e.g. a fresh clone without a remote fetched yet).
function detectBaseSha() {
  for (const ref of ["origin/main", "origin/master"]) {
    try {
      return git(["merge-base", "HEAD", ref]).trim();
    } catch {
      // ref doesn't exist locally; try the next one
    }
  }
  try {
    return git(["rev-parse", "HEAD~1"]).trim();
  } catch {
    return git(["rev-parse", "HEAD"]).trim();
  }
}

const BASE_SHA = process.env.BASE_SHA || detectBaseSha();
// HEAD_SHA left undefined means "working tree" (staged + unstaged changes),
// which is what an agent checking its own uncommitted diff wants. CI passes
// an explicit HEAD_SHA to check a committed state instead.
const HEAD_SHA = process.env.HEAD_SHA;

function getDiffText(base, head) {
  const args = ["diff", "--unified=0", "--no-color", base];
  if (head) args.push(head);
  args.push("--", "src/**/*.ts", "src/**/*.tsx");
  return git(args);
}

function main() {
  if (!fs.existsSync(LCOV_PATH)) {
    console.error(`No lcov report at ${LCOV_PATH} -- run tests with --coverage first.`);
    process.exit(1);
  }

  const diffText = getDiffText(BASE_SHA, HEAD_SHA);
  const added = parseUnifiedDiffAddedLines(diffText);
  const hitMap = parseLcov(fs.readFileSync(LCOV_PATH, "utf8"));
  const newLines = computeNewLineCoverage(added, hitMap);

  console.log(
    `Diff coverage (${BASE_SHA.slice(0, 7)}..${HEAD_SHA ? HEAD_SHA.slice(0, 7) : "working tree"}):`
  );

  if (newLines.total === 0) {
    console.log("  no newly executable lines in coverage collect paths -- passing.");
    process.exit(0);
  }

  for (const file of newLines.files) {
    const pct = ((file.covered / file.total) * 100).toFixed(1);
    const marker = file.uncoveredLines.length > 0 ? "warn" : "ok  ";
    const suffix =
      file.uncoveredLines.length > 0
        ? ` -- uncovered lines: ${file.uncoveredLines.join(", ")}`
        : "";
    console.log(`  ${marker}  ${file.file}: ${file.covered}/${file.total} (${pct}%)${suffix}`);
  }

  console.log(
    `\nTotal: ${newLines.covered}/${newLines.total} added lines covered (${newLines.pct.toFixed(1)}%), threshold ${THRESHOLD}%`
  );

  if (newLines.pct < THRESHOLD) {
    console.error(`\nDiff coverage ${newLines.pct.toFixed(1)}% is below the ${THRESHOLD}% threshold.`);
    process.exit(1);
  }
}

main();
