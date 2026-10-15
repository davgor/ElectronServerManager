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

  it("falls back to the advisory url when an advisory has no title", () => {
    const findings = collectVulnerabilityFindings({
      vulnerabilities: {
        undici: {
          severity: "high",
          via: [{ url: "https://github.com/advisories/GHSA-test" }, {}],
        },
      },
    });
    expect(findings).toEqual([
      {
        name: "undici",
        severity: "high",
        viaTitles: ["https://github.com/advisories/GHSA-test"],
      },
    ]);
  });

  it("skips entries whose severity is missing, unknown or not a string", () => {
    expect(
      collectVulnerabilityFindings({
        vulnerabilities: {
          missing: { via: [] },
          unknown: { severity: "none", via: [] },
          numeric: { severity: 3, via: [] },
          empty: null,
        },
      })
    ).toEqual([]);
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

  it("reports the first advisory title, or points at npm audit when there is none", () => {
    const report = formatFindingsReport([
      {
        name: "braces",
        severity: "high",
        viaTitles: ["Stack exhaustion", "x"],
      },
      { name: "micromatch", severity: "high", viaTitles: [] },
    ]);
    expect(report).toContain("- braces | severity=high | Stack exhaustion");
    expect(report).toContain("- micromatch | severity=high | see npm audit");
  });

  it("formats a passing report", () => {
    expect(formatFindingsReport([])).toBe("No vulnerabilities found");
  });
});
