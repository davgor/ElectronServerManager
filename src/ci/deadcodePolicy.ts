/**
 * Pure helpers for the baseline-aware dead-code gate (ported from
 * BoosterSeat's scripts/deadcode-check.mjs / deadcode-refresh.mjs).
 *
 * `npm run deadcode` fails only on ts-prune findings that are not listed in
 * `.tsprune-ignore`; `npm run deadcode:refresh` rewrites that baseline after
 * intentional export moves/deletes.
 *
 * Keep in sync with scripts/deadcode-check.cjs and
 * scripts/deadcode-refresh.cjs (runtime mirrors; parity-tested in
 * src/__tests__/ci/deadcodePolicy.test.ts).
 */

/** Normalize one ts-prune output line so baselines match across platforms. */
export function normalizeTsPruneLine(line: string): string {
  if (line.length === 0) {
    return "";
  }
  let normalized = line.replace(/^[^\w\\/]+/, "").trim();
  if (normalized.length === 0) {
    return "";
  }
  normalized = normalized.replace(/\\+/g, "/");
  normalized = normalized.replace(/\s*\([^)]*\)\s*$/, "");
  normalized = normalized.replace(/^\//, "");
  return normalized;
}

/** Parse `.tsprune-ignore` content: skip blanks and `#` comments. */
export function parseIgnoreLines(content: string): string[] {
  return content
    .split(/\r?\n/)
    .filter((line) => {
      const trimmed = line.trim();
      return trimmed.length > 0 && !trimmed.startsWith("#");
    })
    .map((line) => normalizeTsPruneLine(line))
    .filter((line) => line.length > 0);
}

/** Findings not covered by the baseline — these fail the gate. */
export function filterNewDeadExports(
  findings: string[],
  ignore: string[]
): string[] {
  const ignoreSet = new Set(ignore);
  return findings.filter((finding) => !ignoreSet.has(finding));
}

/** Serialize the refreshed `.tsprune-ignore` baseline file. */
export function buildIgnoreFileContent(
  findings: string[],
  refreshedDate: string
): string {
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
