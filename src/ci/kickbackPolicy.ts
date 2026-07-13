/**
 * Policy for CI kickback (auto-revert on failed main/master pushes) and for
 * gating Release until required checks pass. Keep `.github/scripts/*` runners
 * aligned with these names and rules.
 */

const PROTECTED_PUSH_BRANCHES = ["main", "master"] as const;

/** Exact GitHub check-run names from the CI workflows (see job `name` / id). */
export const REQUIRED_CI_CHECK_NAMES = [
  "lint",
  "deadcode",
  "type-check",
  "Run unit tests (20.x)",
  "npm audit (fail on any CVE)",
] as const;

type WorkflowConclusion = string | null;

interface KickbackInput {
  conclusion: WorkflowConclusion;
  event: string;
  headBranch: string;
  headCommitMessage: string;
}

function isKickbackCommitMessage(message: string): boolean {
  return message.trimStart().startsWith("Kickback:");
}

export function shouldKickback(input: KickbackInput): boolean {
  if (input.conclusion !== "failure") {
    return false;
  }
  if (input.event !== "push") {
    return false;
  }
  if (
    !PROTECTED_PUSH_BRANCHES.includes(
      input.headBranch as (typeof PROTECTED_PUSH_BRANCHES)[number]
    )
  ) {
    return false;
  }
  if (isKickbackCommitMessage(input.headCommitMessage)) {
    return false;
  }
  return true;
}

interface CheckRunSummary {
  name: string;
  status: string;
  conclusion: WorkflowConclusion;
}

type RequiredChecksResult = "pending" | "success" | "failure";

export function evaluateRequiredChecks(
  requiredNames: readonly string[],
  checkRuns: readonly CheckRunSummary[]
): RequiredChecksResult {
  const byName = new Map<string, CheckRunSummary>();
  for (const run of checkRuns) {
    const previous = byName.get(run.name);
    // Prefer a completed failure over an in-progress duplicate if both exist.
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

interface ReleaseGateInput {
  eventName: string;
  actor: string;
  headCommitMessage: string;
  /** When provided and non-empty, markdown-only changes skip release (except workflow_dispatch). */
  changedFiles?: readonly string[];
}

/** True only when every path is a markdown file. Empty list is not markdown-only (unknown set). */
export function isMarkdownOnlyChange(files: readonly string[]): boolean {
  if (files.length === 0) {
    return false;
  }
  return files.every((file) => /\.md$/i.test(file));
}

export function shouldRunRelease(input: ReleaseGateInput): boolean {
  if (input.eventName === "workflow_dispatch") {
    return true;
  }
  if (
    input.changedFiles !== undefined &&
    isMarkdownOnlyChange(input.changedFiles)
  ) {
    return false;
  }
  if (input.eventName === "merge_group") {
    return true;
  }
  if (input.eventName !== "push") {
    return false;
  }
  if (input.actor === "github-actions[bot]") {
    return false;
  }
  if (isKickbackCommitMessage(input.headCommitMessage)) {
    return false;
  }
  return true;
}
