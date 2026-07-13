/**
 * Keep in sync with src/ci/kickbackPolicy.ts (REQUIRED_CI_CHECK_NAMES + rules).
 */

const PROTECTED_PUSH_BRANCHES = new Set(["main", "master"]);

const REQUIRED_CI_CHECK_NAMES = [
  "lint",
  "deadcode",
  "type-check",
  "Run unit tests (20.x)",
  "npm audit (fail on any CVE)",
];

function isKickbackCommitMessage(message) {
  return String(message || "")
    .trimStart()
    .startsWith("Kickback:");
}

function shouldKickback(input) {
  if (input.conclusion !== "failure") return false;
  if (input.event !== "push") return false;
  if (!PROTECTED_PUSH_BRANCHES.has(input.headBranch)) return false;
  if (isKickbackCommitMessage(input.headCommitMessage)) return false;
  return true;
}

function evaluateRequiredChecks(requiredNames, checkRuns) {
  const byName = new Map();
  for (const run of checkRuns) {
    const previous = byName.get(run.name);
    if (!previous) {
      byName.set(run.name, run);
      continue;
    }
    if (
      previous.status !== "completed" &&
      (run.status === "completed" || run.conclusion === "failure")
    ) {
      byName.set(run.name, run);
    }
  }

  let anyPending = false;
  for (const name of requiredNames) {
    const run = byName.get(name);
    if (!run) {
      anyPending = true;
      continue;
    }
    if (run.status !== "completed") {
      anyPending = true;
      continue;
    }
    if (run.conclusion !== "success") {
      return "failure";
    }
  }
  return anyPending ? "pending" : "success";
}

function shouldRunRelease(input) {
  if (
    input.eventName === "workflow_dispatch" ||
    input.eventName === "merge_group"
  ) {
    return true;
  }
  if (input.eventName !== "push") return false;
  if (input.actor === "github-actions[bot]") return false;
  if (isKickbackCommitMessage(input.headCommitMessage)) return false;
  return true;
}

module.exports = {
  REQUIRED_CI_CHECK_NAMES,
  PROTECTED_PUSH_BRANCHES,
  isKickbackCommitMessage,
  shouldKickback,
  evaluateRequiredChecks,
  shouldRunRelease,
};
