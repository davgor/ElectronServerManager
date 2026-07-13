/**
 * CVE gate CLI (zero-CVE policy). Keep in sync with
 * src/security/npmAuditFindings.ts so `npm run audit:cve` works without a
 * TypeScript compile step.
 */

const FAIL_SEVERITIES = new Set([
  "info",
  "low",
  "moderate",
  "high",
  "critical",
]);

function collectVulnerabilityFindings(auditJson) {
  if (auditJson === null || typeof auditJson !== "object") {
    return [];
  }

  const vulnerabilities = auditJson.vulnerabilities;
  if (vulnerabilities === null || typeof vulnerabilities !== "object") {
    return [];
  }

  const findings = [];

  for (const [name, raw] of Object.entries(vulnerabilities)) {
    if (raw === null || typeof raw !== "object") {
      continue;
    }
    const severity = String(raw.severity ?? "");
    if (!FAIL_SEVERITIES.has(severity)) {
      continue;
    }

    const via = Array.isArray(raw.via) ? raw.via : [];
    const viaTitles = via
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }
        if (item !== null && typeof item === "object") {
          if (typeof item.title === "string") {
            return item.title;
          }
          if (typeof item.url === "string") {
            return item.url;
          }
        }
        return "";
      })
      .filter((title) => title !== "");

    findings.push({ name, severity, viaTitles });
  }

  const rank = {
    critical: 0,
    high: 1,
    moderate: 2,
    low: 3,
    info: 4,
  };
  findings.sort((a, b) => {
    const ra = rank[a.severity] ?? 9;
    const rb = rank[b.severity] ?? 9;
    if (ra !== rb) {
      return ra - rb;
    }
    return a.name.localeCompare(b.name);
  });

  return findings;
}

function formatFindingsReport(findings) {
  if (findings.length === 0) {
    return "No vulnerabilities found";
  }
  const lines = ["Found vulnerabilities (zero-CVE policy):"];
  for (const finding of findings) {
    const detail =
      finding.viaTitles.length > 0 ? finding.viaTitles[0] : "see npm audit";
    lines.push(
      `- ${finding.name} | severity=${finding.severity} | ${detail}`
    );
  }
  lines.push(
    "",
    "Action required: resolve or upgrade affected dependencies before merging."
  );
  return lines.join("\n");
}

module.exports = {
  collectVulnerabilityFindings,
  formatFindingsReport,
};

if (require.main === module) {
  const { spawnSync } = require("child_process");
  const result = spawnSync("npm", ["audit", "--json"], {
    encoding: "utf8",
    shell: true,
    maxBuffer: 20 * 1024 * 1024,
  });
  let auditJson;
  try {
    auditJson = JSON.parse(result.stdout || "{}");
  } catch (error) {
    console.error("Failed to parse npm audit JSON");
    console.error(error);
    process.exit(1);
  }

  const findings = collectVulnerabilityFindings(auditJson);
  console.log(formatFindingsReport(findings));
  process.exit(findings.length > 0 ? 1 : 0);
}
