import {
  REQUIRED_CI_CHECK_NAMES,
  evaluateRequiredChecks,
  shouldKickback,
  shouldRunRelease,
} from "../../ci/kickbackPolicy";

describe("shouldKickback", () => {
  const base = {
    conclusion: "failure" as const,
    event: "push",
    headBranch: "main",
    headCommitMessage: "fix: break something",
  };

  it("kickbacks a failed push to main", () => {
    expect(shouldKickback(base)).toBe(true);
  });

  it("kickbacks a failed push to master", () => {
    expect(shouldKickback({ ...base, headBranch: "master" })).toBe(true);
  });

  it("does not kickback successes", () => {
    expect(shouldKickback({ ...base, conclusion: "success" })).toBe(false);
  });

  it("does not kickback pull_request events", () => {
    expect(shouldKickback({ ...base, event: "pull_request" })).toBe(false);
  });

  it("does not kickback other branches", () => {
    expect(shouldKickback({ ...base, headBranch: "feature/x" })).toBe(false);
  });

  it("does not kickback an existing Kickback commit (no loop)", () => {
    expect(
      shouldKickback({
        ...base,
        headCommitMessage: "Kickback: revert abc123 (CI failed on Lint)",
      })
    ).toBe(false);
  });
});

describe("evaluateRequiredChecks", () => {
  const required = [...REQUIRED_CI_CHECK_NAMES];

  it("is pending when any required check is missing or in progress", () => {
    expect(
      evaluateRequiredChecks(required, [
        { name: "lint", status: "completed", conclusion: "success" },
      ])
    ).toBe("pending");

    expect(
      evaluateRequiredChecks(required, [
        { name: "lint", status: "in_progress", conclusion: null },
        { name: "deadcode", status: "completed", conclusion: "success" },
        { name: "type-check", status: "completed", conclusion: "success" },
        {
          name: "Run unit tests (20.x)",
          status: "completed",
          conclusion: "success",
        },
        {
          name: "npm audit (fail on any CVE)",
          status: "completed",
          conclusion: "success",
        },
      ])
    ).toBe("pending");
  });

  it("is failure when any required check failed", () => {
    expect(
      evaluateRequiredChecks(required, [
        { name: "lint", status: "completed", conclusion: "failure" },
        { name: "deadcode", status: "completed", conclusion: "success" },
        { name: "type-check", status: "completed", conclusion: "success" },
        {
          name: "Run unit tests (20.x)",
          status: "completed",
          conclusion: "success",
        },
        {
          name: "npm audit (fail on any CVE)",
          status: "completed",
          conclusion: "success",
        },
      ])
    ).toBe("failure");
  });

  it("is success when every required check completed successfully", () => {
    expect(
      evaluateRequiredChecks(required, [
        { name: "lint", status: "completed", conclusion: "success" },
        { name: "deadcode", status: "completed", conclusion: "success" },
        { name: "type-check", status: "completed", conclusion: "success" },
        {
          name: "Run unit tests (20.x)",
          status: "completed",
          conclusion: "success",
        },
        {
          name: "npm audit (fail on any CVE)",
          status: "completed",
          conclusion: "success",
        },
        { name: "release", status: "in_progress", conclusion: null },
      ])
    ).toBe("success");
  });
});

describe("shouldRunRelease", () => {
  it("runs for normal human pushes", () => {
    expect(
      shouldRunRelease({
        eventName: "push",
        actor: "davgor",
        headCommitMessage: "feat: ship it",
      })
    ).toBe(true);
  });

  it("skips github-actions bot pushes", () => {
    expect(
      shouldRunRelease({
        eventName: "push",
        actor: "github-actions[bot]",
        headCommitMessage: "Bump version to 1.0.23",
      })
    ).toBe(false);
  });

  it("skips Kickback commits even from humans", () => {
    expect(
      shouldRunRelease({
        eventName: "push",
        actor: "davgor",
        headCommitMessage: "Kickback: revert abc (CI failed on Lint)",
      })
    ).toBe(false);
  });

  it("allows workflow_dispatch and merge_group", () => {
    expect(
      shouldRunRelease({
        eventName: "workflow_dispatch",
        actor: "github-actions[bot]",
        headCommitMessage: "",
      })
    ).toBe(true);
    expect(
      shouldRunRelease({
        eventName: "merge_group",
        actor: "github-actions[bot]",
        headCommitMessage: "Merge …",
      })
    ).toBe(true);
  });
});
