#!/usr/bin/env node
/**
 * Poll GitHub check-runs for REQUIRED_CI_CHECK_NAMES until success or failure.
 * Used by release.yml so packaging does not start before CI is green.
 */
const { execFileSync } = require("child_process");
const {
  REQUIRED_CI_CHECK_NAMES,
  evaluateRequiredChecks,
} = require("./kickback-policy.cjs");

const POLL_MS = Number(process.env.CHECK_POLL_MS || 10000);
const TIMEOUT_MS = Number(process.env.CHECK_TIMEOUT_MS || 45 * 60 * 1000);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function listCheckRuns(repo, sha) {
  const out = execFileSync(
    "gh",
    ["api", `repos/${repo}/commits/${sha}/check-runs?per_page=100`],
    { encoding: "utf8", env: process.env },
  );
  const parsed = JSON.parse(out);
  const runs = Array.isArray(parsed.check_runs) ? parsed.check_runs : [];
  return runs.map((run) => ({
    name: run.name,
    status: run.status,
    conclusion: run.conclusion,
  }));
}

async function main() {
  const repo = process.env.GITHUB_REPOSITORY || process.env.REPO;
  const sha = process.env.SHA || process.env.GITHUB_SHA;
  if (!repo || !sha) {
    console.error("Missing GITHUB_REPOSITORY/REPO or SHA");
    process.exit(1);
  }

  const started = Date.now();
  for (;;) {
    const checks = listCheckRuns(repo, sha);
    const result = evaluateRequiredChecks(REQUIRED_CI_CHECK_NAMES, checks);
    const snapshot = REQUIRED_CI_CHECK_NAMES.map((name) => {
      const hit = checks.find((c) => c.name === name);
      return {
        name,
        status: hit?.status ?? "missing",
        conclusion: hit?.conclusion ?? null,
      };
    });
    console.log(JSON.stringify({ result, snapshot }));

    if (result === "success") {
      console.log("All required CI checks passed");
      return;
    }
    if (result === "failure") {
      console.error("Required CI check failed; refusing to release");
      process.exit(1);
    }
    if (Date.now() - started > TIMEOUT_MS) {
      console.error("Timed out waiting for required CI checks");
      process.exit(1);
    }
    await sleep(POLL_MS);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
