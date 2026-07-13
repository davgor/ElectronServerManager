interface NpmAuditFinding {
  name: string;
  severity: string;
  viaTitles: string[];
}

/** Any npm audit severity counts as a gate failure (zero-CVE policy). */
const FAIL_SEVERITIES = new Set([
  "info",
  "low",
  "moderate",
  "high",
  "critical",
]);

/**
 * Parse modern `npm audit --json` output and collect all vulnerability findings.
 * Legacy npm used `advisories`; current npm uses `vulnerabilities`.
 */
export function collectVulnerabilityFindings(
  auditJson: unknown
): NpmAuditFinding[] {
  if (auditJson === null || typeof auditJson !== "object") {
    return [];
  }

  const root = auditJson as Record<string, unknown>;
  const vulnerabilities = root.vulnerabilities;
  if (vulnerabilities === null || typeof vulnerabilities !== "object") {
    return [];
  }

  const findings: NpmAuditFinding[] = [];

  for (const [name, raw] of Object.entries(
    vulnerabilities as Record<string, unknown>
  )) {
    if (raw === null || typeof raw !== "object") {
      continue;
    }
    const entry = raw as Record<string, unknown>;
    const severity = String(entry.severity ?? "");
    if (!FAIL_SEVERITIES.has(severity)) {
      continue;
    }

    const via = Array.isArray(entry.via) ? entry.via : [];
    const viaTitles = via
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }
        if (item !== null && typeof item === "object") {
          const advisory = item as Record<string, unknown>;
          if (typeof advisory.title === "string") {
            return advisory.title;
          }
          if (typeof advisory.url === "string") {
            return advisory.url;
          }
        }
        return "";
      })
      .filter((title) => title !== "");

    findings.push({ name, severity, viaTitles });
  }

  const rank: Record<string, number> = {
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

export function formatFindingsReport(findings: NpmAuditFinding[]): string {
  if (findings.length === 0) {
    return "No vulnerabilities found";
  }
  const lines = ["Found vulnerabilities (zero-CVE policy):"];
  for (const finding of findings) {
    const detail =
      finding.viaTitles.length > 0 ? finding.viaTitles[0] : "see npm audit";
    lines.push(`- ${finding.name} | severity=${finding.severity} | ${detail}`);
  }
  lines.push(
    "",
    "Action required: resolve or upgrade affected dependencies before merging."
  );
  return lines.join("\n");
}
