import { DEFAULT_CONFIG } from "../src/config";
import { parseNameStatus, resolveGitScope } from "../src/gitScope";

describe("resolveGitScope", () => {
  it("grades added and modified unit test files", () => {
    const scope = resolveGitScope({
      config: DEFAULT_CONFIG,
      entries: [
        { status: "A", path: "src/__tests__/renderer/NewPage.test.tsx" },
        { status: "M", path: "src/__tests__/main/appUpdater.test.ts" },
        { status: "A", path: "src/renderer/NewPage.tsx" },
        { status: "M", path: "src/main/appUpdater.ts" },
      ],
    });
    expect(scope.gradedTestFiles).toEqual([
      "src/__tests__/main/appUpdater.test.ts",
      "src/__tests__/renderer/NewPage.test.tsx",
    ]);
    expect(scope.changedModules).toEqual([
      "src/main/appUpdater.ts",
      "src/renderer/NewPage.tsx",
    ]);
  });

  it("excludes paths matching exclude globs", () => {
    const scope = resolveGitScope({
      config: {
        ...DEFAULT_CONFIG,
        exclude: ["src/__mocks__/**", "**/setup.ts"],
      },
      entries: [
        { status: "A", path: "src/__mocks__/api.test.ts" },
        { status: "A", path: "src/utils/math.test.ts" },
        { status: "M", path: "src/__mocks__/api.ts" },
      ],
    });
    expect(scope.gradedTestFiles).toEqual(["src/utils/math.test.ts"]);
    expect(scope.changedModules).toEqual([]);
  });

  it("treats renames as graded at the new path", () => {
    const scope = resolveGitScope({
      config: DEFAULT_CONFIG,
      entries: [
        { status: "R", path: "src/foo.test.ts", oldPath: "src/bar.test.ts" },
      ],
    });
    expect(scope.gradedTestFiles).toEqual(["src/foo.test.ts"]);
  });

  it("does not treat src/__tests__ helpers as production modules", () => {
    const scope = resolveGitScope({
      config: DEFAULT_CONFIG,
      entries: [
        { status: "M", path: "src/__tests__/setup.ts" },
        { status: "M", path: "src/renderer/App.tsx" },
      ],
    });
    expect(scope.changedModules).toEqual(["src/renderer/App.tsx"]);
    expect(scope.gradedTestFiles).toEqual([]);
  });

  it("does not treat fireguard's own code as production modules", () => {
    const scope = resolveGitScope({
      config: DEFAULT_CONFIG,
      entries: [{ status: "M", path: "fireguard/src/cli.ts" }],
    });
    expect(scope.changedModules).toEqual([]);
  });
});

describe("parseNameStatus", () => {
  it("parses added, modified, and renamed paths from git name-status", () => {
    const output = [
      "A\tsrc/new.test.ts",
      "M\tsrc/old.ts",
      "R100\tsrc/a.test.ts\tsrc/b.test.ts",
      "D\tsrc/gone.ts",
      "",
    ].join("\n");
    expect(parseNameStatus(output)).toEqual([
      { status: "A", path: "src/new.test.ts" },
      { status: "M", path: "src/old.ts" },
      { status: "R", oldPath: "src/a.test.ts", path: "src/b.test.ts" },
      { status: "D", path: "src/gone.ts" },
    ]);
  });
});
