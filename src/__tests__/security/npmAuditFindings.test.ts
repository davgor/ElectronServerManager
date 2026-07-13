import {
  collectVulnerabilityFindings,
  formatFindingsReport,
} from "../../security/npmAuditFindings";

describe("collectVulnerabilityFindings", () => {
  it("returns empty for legacy advisories-only JSON (modern gate ignores it)", () => {
    expect(
      collectVulnerabilityFindings({
        advisories: {
          "1": { severity: "critical", title: "old format" },
        },
      })
    ).toEqual([]);
  });

  it("collects low through critical from vulnerabilities (zero-CVE policy)", () => {
    const findings = collectVulnerabilityFindings({
      vulnerabilities: {
        leftpad: {
          severity: "low",
          via: [{ title: "Low severity issue" }],
        },
        vite: {
          severity: "high",
          via: [{ title: "Vite path traversal" }],
        },
        handlebars: {
          severity: "critical",
          via: [{ title: "Handlebars injection" }],
        },
        postcss: {
          severity: "moderate",
          via: ["postcss xss"],
        },
      },
    });

    expect(findings.map((f) => f.name)).toEqual([
      "handlebars",
      "vite",
      "postcss",
      "leftpad",
    ]);
    expect(findings[0].severity).toBe("critical");
    expect(findings[3].severity).toBe("low");
    expect(findings[1].viaTitles).toEqual(["Vite path traversal"]);
  });

  it("formats a failing report", () => {
    const report = formatFindingsReport([
      {
        name: "leftpad",
        severity: "low",
        viaTitles: ["Low severity issue"],
      },
    ]);
    expect(report).toContain("Found vulnerabilities (zero-CVE policy)");
    expect(report).toContain("leftpad | severity=low");
  });

  it("formats a passing report", () => {
    expect(formatFindingsReport([])).toBe("No vulnerabilities found");
  });
});
