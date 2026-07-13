#!/usr/bin/env node
/**
 * Invoked by kickback.yml after a required CI workflow fails on push.
 * Reverts the failing SHA on main/master when policy says so.
 */
const { execFileSync } = require("child_process");
const { shouldKickback } = require("./kickback-policy.cjs");

function ghApi(path) {
  const out = execFileSync(
    "gh",
    ["api", path],
    { encoding: "utf8", env: process.env },
  );
  return JSON.parse(out);
}

function git(args, opts = {}) {
  return execFileSync("git", args, {
    encoding: "utf8",
    stdio: opts.stdio ?? "pipe",
    env: process.env,
  });
}

function main() {
  const conclusion = process.env.CONCLUSION || "";
  const event = process.env.EVENT_NAME || "";
  const branch = process.env.BRANCH || "";
  const sha = process.env.SHA || "";
  const repo = process.env.GITHUB_REPOSITORY || process.env.REPO || "";

  if (!sha || !branch || !repo) {
    console.error("Missing SHA, BRANCH, or repository");
    process.exit(1);
  }

  const commit = ghApi(`repos/${repo}/commits/${sha}`);
  const headCommitMessage = commit.commit?.message || "";

  const decision = shouldKickback({
    conclusion,
    event,
    headBranch: branch,
    headCommitMessage,
  });

  console.log(
    JSON.stringify({
      decision,
      conclusion,
      event,
      branch,
      sha,
      headCommitMessage: headCommitMessage.split("\n")[0],
    }),
  );

  if (!decision) {
    console.log("Policy: skip kickback");
    return;
  }

  git(["config", "user.name", "github-actions[bot]"]);
  git([
    "config",
    "user.email",
    "41898282+github-actions[bot]@users.noreply.github.com",
  ]);

  git(["fetch", "origin", branch]);
  git(["checkout", "-B", branch, `origin/${branch}`]);

  try {
    git(["merge-base", "--is-ancestor", sha, "HEAD"]);
  } catch {
    console.log(`Commit ${sha} is no longer on ${branch}; skipping`);
    return;
  }

  const already = git([
    "log",
    "--oneline",
    "--grep",
    `Kickback: revert ${sha}`,
  ]).trim();
  if (already) {
    console.log("Kickback commit already present; skipping");
    return;
  }

  const workflowName = process.env.WORKFLOW_NAME || "CI";
  try {
    git(["revert", "--no-commit", sha]);
  } catch (err) {
    console.error("git revert failed (likely conflict)");
    try {
      git(["revert", "--abort"]);
    } catch {
      /* ignore */
    }
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }

  git([
    "commit",
    "-m",
    `Kickback: revert ${sha} (CI failed on ${workflowName})`,
  ]);
  git(["push", "origin", `HEAD:${branch}`], { stdio: "inherit" });
  console.log(`Pushed kickback revert of ${sha} to ${branch}`);
}

main();
