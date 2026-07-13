import {
  REQUIRED_CI_CHECK_NAMES,
  evaluateRequiredChecks,
  isMarkdownOnlyChange,
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

describe("isMarkdownOnlyChange", () => {
  it("is false for an empty file list (unknown change set)", () => {
    expect(isMarkdownOnlyChange([])).toBe(false);
  });

  it("is true when every path ends with .md", () => {
    expect(
      isMarkdownOnlyChange(["README.md", "board/done/028-x.md", "docs/A.MD"])
    ).toBe(true);
  });

  it("is false when any non-markdown path is present", () => {
    expect(
      isMarkdownOnlyChange(["README.md", "src/ci/kickbackPolicy.ts"])
    ).toBe(false);
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

  it("skips markdown-only pushes and merge_group when files are known", () => {
    expect(
      shouldRunRelease({
        eventName: "push",
        actor: "davgor",
        headCommitMessage: "docs: update board",
        changedFiles: ["board/done/028.md", "README.md"],
      })
    ).toBe(false);
    expect(
      shouldRunRelease({
        eventName: "merge_group",
        actor: "davgor",
        headCommitMessage: "Merge …",
        changedFiles: ["ARCHITECTURE.md"],
      })
    ).toBe(false);
  });

  it("still runs when markdown is mixed with other files", () => {
    expect(
      shouldRunRelease({
        eventName: "push",
        actor: "davgor",
        headCommitMessage: "feat: ship + docs",
        changedFiles: ["README.md", "package.json"],
      })
    ).toBe(true);
  });

  it("allows workflow_dispatch even for markdown-only changes", () => {
    expect(
      shouldRunRelease({
        eventName: "workflow_dispatch",
        actor: "github-actions[bot]",
        headCommitMessage: "",
        changedFiles: ["README.md"],
      })
    ).toBe(true);
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
