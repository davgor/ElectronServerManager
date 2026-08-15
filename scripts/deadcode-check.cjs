#!/usr/bin/env node
/**
 * Baseline-aware dead-code gate: fail when ts-prune reports unused exports
 * that are not listed in .tsprune-ignore.
 *
 * Keep the pure helpers in sync with src/ci/deadcodePolicy.ts (parity-tested
 * in src/__tests__/ci/deadcodePolicy.test.ts). Refresh the baseline after
 * intentional export moves/deletes with `npm run deadcode:refresh`.
 */
const { spawnSync } = require("child_process");
const { existsSync, readFileSync } = require("fs");
const { join } = require("path");

const ROOT = join(__dirname, "..");
const IGNORE_PATH = join(ROOT, ".tsprune-ignore");
const PROJECTS = ["tsconfig.json"];

function normalizeTsPruneLine(line) {
  if (!line) return "";
  let normalized = line.replace(/^[^\w\\/]+/, "").trim();
  if (!normalized) return "";
  normalized = normalized.replace(/\\+/g, "/");
  normalized = normalized.replace(/\s*\([^)]*\)\s*$/, "");
  normalized = normalized.replace(/^\//, "");
  return normalized;
}

function parseIgnoreLines(content) {
  return content
    .split(/\r?\n/)
    .filter((line) => {
      const trimmed = line.trim();
      return trimmed.length > 0 && !trimmed.startsWith("#");
    })
    .map((line) => normalizeTsPruneLine(line))
    .filter(Boolean);
}

function filterNewDeadExports(findings, ignore) {
  const ignoreSet = new Set(ignore);
  return findings.filter((finding) => !ignoreSet.has(finding));
}

function readIgnoreList(path) {
  if (!existsSync(path)) return [];
  return parseIgnoreLines(readFileSync(path, "utf8"));
}

function runTsPrune(project) {
  const result = spawnSync("npx", ["-y", "ts-prune", "--project", project], {
    cwd: ROOT,
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    const stderr = result.stderr ? result.stderr.trim() : "";
    throw new Error(
      stderr || `ts-prune failed for ${project} with exit code ${result.status}`
    );
  }
  return result.stdout
    .split(/\r?\n/)
    .map((line) => normalizeTsPruneLine(line))
    .filter(Boolean);
}

function main() {
  const ignore = readIgnoreList(IGNORE_PATH);
  const findings = [];
  for (const project of PROJECTS) {
    findings.push(...runTsPrune(project));
  }

  const fresh = filterNewDeadExports(findings, ignore);
  if (fresh.length > 0) {
    console.error("New dead exports detected:");
    for (const line of fresh) {
      console.error(line);
    }
    console.error(
      "\nRemove the export, or baseline intentional ones with: npm run deadcode:refresh"
    );
    process.exit(1);
  }

  console.log("No new dead exports found.");
}

if (require.main === module) {
  main();
}

module.exports = {
  normalizeTsPruneLine,
  parseIgnoreLines,
  filterNewDeadExports,
  runTsPrune,
};
