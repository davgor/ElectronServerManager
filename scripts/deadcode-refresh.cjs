#!/usr/bin/env node
/**
 * Rewrite .tsprune-ignore from current ts-prune findings.
 * Use after intentional export moves/deletes so `npm run deadcode` stays green.
 *
 * Keep buildIgnoreFileContent in sync with src/ci/deadcodePolicy.ts
 * (parity-tested in src/__tests__/ci/deadcodePolicy.test.ts).
 */
const { writeFileSync } = require("fs");
const { join } = require("path");

const { runTsPrune } = require("./deadcode-check.cjs");

const ROOT = join(__dirname, "..");
const IGNORE_PATH = join(ROOT, ".tsprune-ignore");
const PROJECTS = ["tsconfig.json"];

function buildIgnoreFileContent(findings, refreshedDate) {
  const entries = [...new Set(findings)].sort();
  const header = [
    "# Baseline ignore for ts-prune (one pattern per line)",
    "# Entries flagged by ts-prune that are intentional (dynamic use, public API for tests, etc.)",
    "# Refresh after export moves/deletes: npm run deadcode:refresh",
    `# Refreshed ${refreshedDate} (${entries.length} entries)`,
    "",
  ];
  return `${header.concat(entries).join("\n")}\n`;
}

function main() {
  const findings = [];
  for (const project of PROJECTS) {
    findings.push(...runTsPrune(project));
  }
  const content = buildIgnoreFileContent(
    findings,
    new Date().toISOString().slice(0, 10)
  );
  writeFileSync(IGNORE_PATH, content, "utf8");
  const count = content.split("\n").filter((l) => /^[^#\s]/.test(l)).length;
  console.log(`Wrote ${count} entries to .tsprune-ignore`);
}

if (require.main === module) {
  main();
}

module.exports = { buildIgnoreFileContent };
