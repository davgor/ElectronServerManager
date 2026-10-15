import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DEFAULT_CONFIG } from "../src/config";
import {
  createMutationApplier,
  createTestCommandRunner,
  resolveSpawnTarget,
} from "../src/processAdapters";

describe("resolveSpawnTarget", () => {
  const cwd = join("repo");
  const jestManifest = JSON.stringify({ bin: { jest: "./bin/jest.js" } });
  const readJest = (path: string): string | undefined =>
    path === join(cwd, "node_modules", "jest", "package.json")
      ? jestManifest
      : undefined;

  it("runs an installed npx bin through node on win32", () => {
    expect(
      resolveSpawnTarget("npx", ["jest", "--runTestsByPath", "a.test.ts"], {
        cwd,
        platform: "win32",
        nodePath: "node.exe",
        readPackageJson: readJest,
      })
    ).toEqual({
      command: "node.exe",
      args: [
        join(cwd, "node_modules", "jest", "bin", "jest.js"),
        "--runTestsByPath",
        "a.test.ts",
      ],
    });
  });

  it("accepts a string bin field", () => {
    expect(
      resolveSpawnTarget("npx", ["tool"], {
        cwd,
        platform: "win32",
        nodePath: "node.exe",
        readPackageJson: () => JSON.stringify({ bin: "cli.js" }),
      })
    ).toEqual({
      command: "node.exe",
      args: [join(cwd, "node_modules", "tool", "cli.js")],
    });
  });

  it.each([
    ["non-Windows platforms", "linux", "npx", ["jest", "a.test.ts"]],
    ["commands other than npx", "win32", "node", ["jest", "a.test.ts"]],
    ["npx flags before the bin", "win32", "npx", ["-y", "jest"]],
    ["bins that are not installed", "win32", "npx", ["vitest", "a.test.ts"]],
    ["npx with no arguments", "win32", "npx", []],
  ] as const)("leaves %s unchanged", (_label, platform, command, args) => {
    expect(
      resolveSpawnTarget(command, [...args], {
        cwd,
        platform,
        nodePath: "node.exe",
        readPackageJson: readJest,
      })
    ).toEqual({ command, args: [...args] });
  });

  it("leaves packages without a matching bin unchanged", () => {
    expect(
      resolveSpawnTarget("npx", ["jest"], {
        cwd,
        platform: "win32",
        nodePath: "node.exe",
        readPackageJson: () => JSON.stringify({ bin: { other: "x.js" } }),
      })
    ).toEqual({ command: "npx", args: ["jest"] });
  });

  it("leaves packages with an unreadable manifest unchanged", () => {
    expect(
      resolveSpawnTarget("npx", ["jest"], {
        cwd,
        platform: "win32",
        nodePath: "node.exe",
        readPackageJson: () => "{ not json",
      })
    ).toEqual({ command: "npx", args: ["jest"] });
  });
});

describe("createTestCommandRunner", () => {
  it("runs npx bins without a shell on win32 and passes the test files", async () => {
    const dir = await mkdtemp(join(tmpdir(), "fireguard-"));
    const pkgDir = join(dir, "node_modules", "fakebin");
    await mkdir(pkgDir, { recursive: true });
    await writeFile(
      join(pkgDir, "package.json"),
      JSON.stringify({ name: "fakebin", bin: { fakebin: "cli.js" } }),
      "utf8"
    );
    await writeFile(
      join(pkgDir, "cli.js"),
      "process.stdout.write(JSON.stringify(process.argv.slice(2)));\nprocess.exit(3);\n",
      "utf8"
    );

    const runOnce = createTestCommandRunner({
      cwd: dir,
      config: { ...DEFAULT_CONFIG, testCommand: "npx fakebin --flag" },
      platform: "win32",
    });

    await expect(runOnce(["a & b.test.ts"])).resolves.toEqual({
      ok: false,
      error: JSON.stringify(["--flag", "a & b.test.ts"]),
    });
  });

  it("reports a command that cannot be spawned as a failed run", async () => {
    const dir = await mkdtemp(join(tmpdir(), "fireguard-"));
    const runOnce = createTestCommandRunner({
      cwd: dir,
      config: {
        ...DEFAULT_CONFIG,
        testCommand: "fireguard-missing-binary --runTestsByPath",
      },
    });

    const result = await runOnce(["a.test.ts"]);

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/ENOENT/);
  });
});

describe("createMutationApplier", () => {
  it("restores original source after applying a mutant", async () => {
    const dir = await mkdtemp(join(tmpdir(), "fireguard-"));
    const rel = "mod.ts";
    const absolute = join(dir, rel);
    const original = "export const n = 1;\n";
    await writeFile(absolute, original, "utf8");

    const seen: string[] = [];
    const applyAndTest = createMutationApplier({
      cwd: dir,
      runOnce: async () => {
        seen.push(await readFile(absolute, "utf8"));
        return { ok: false };
      },
    });

    const result = await applyAndTest({
      file: rel,
      originalSource: original,
      mutatedSource: "export const n = 2;\n",
      relatedTests: ["mod.test.ts"],
    });

    expect(result.ok).toBe(false);
    expect(seen).toEqual(["export const n = 2;\n"]);
    expect(await readFile(absolute, "utf8")).toBe(original);
  });

  it("treats mutants as survived when no related tests exist", async () => {
    const dir = await mkdtemp(join(tmpdir(), "fireguard-"));
    const rel = "mod.ts";
    await writeFile(join(dir, rel), "export const n = 1;\n", "utf8");
    const applyAndTest = createMutationApplier({
      cwd: dir,
      runOnce: async () => ({ ok: false }),
    });
    const result = await applyAndTest({
      file: rel,
      originalSource: "export const n = 1;\n",
      mutatedSource: "export const n = 2;\n",
      relatedTests: [],
    });
    expect(result.ok).toBe(true);
    expect(await readFile(join(dir, rel), "utf8")).toBe(
      "export const n = 1;\n"
    );
  });
});
