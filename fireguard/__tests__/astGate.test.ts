import { DEFAULT_CONFIG } from "../src/config";
import { analyzeTestSource, runAstGate } from "../src/gates/astGate";

const solidSource = `
import { add } from './add';

describe('add', () => {
  it('adds positives', () => {
    expect(add(2, 3)).toBe(5);
  });
  it('adds negatives', () => {
    expect(add(-1, -1)).toBe(-2);
  });
});
`;

const slopSource = `
const mockAdd = jest.fn(() => 5);
const mockSub = jest.fn(() => 0);
const mockMul = jest.fn(() => 0);
jest.mock('./add', () => ({ add: mockAdd }));
jest.spyOn(console, 'log');

describe('add', () => {
  it('calls mock', () => {
    mockAdd(1, 2);
    mockSub(1, 1);
    mockMul(2, 2);
    expect(mockAdd).toHaveBeenCalled();
  });
  it('coverage padding', () => {
    mockAdd(0, 0);
  });
});
`;

describe("analyzeTestSource", () => {
  it("counts asserts and zero mocks for solid tests", () => {
    const result = analyzeTestSource("solid.test.ts", solidSource);
    expect(result.assertionCount).toBe(2);
    expect(result.mockCount).toBe(0);
    expect(result.tautologicalCount).toBe(0);
    expect(result.emptyTests).toHaveLength(0);
  });

  it("flags over-mocking, tautologies, and empty tests in slop", () => {
    const result = analyzeTestSource("slop.test.ts", slopSource);
    expect(result.mockCount).toBeGreaterThan(result.assertionCount);
    expect(result.tautologicalCount).toBeGreaterThan(0);
    expect(
      result.emptyTests.some((t) => t.name.includes("coverage padding"))
    ).toBe(true);
  });

  it("counts vi.* mocks from Vitest-style sources too", () => {
    const result = analyzeTestSource(
      "vitest.test.ts",
      "const m = vi.fn();\nit('x', () => { expect(1).toBe(1); });"
    );
    expect(result.mockCount).toBe(1);
  });
});

describe("runAstGate", () => {
  it("fails when mock ratio exceeds threshold", () => {
    const gate = runAstGate({
      config: DEFAULT_CONFIG,
      files: [{ path: "slop.test.ts", source: slopSource }],
    });
    expect(gate.pass).toBe(false);
    expect(gate.findings.some((f) => f.rule === "mock-ratio")).toBe(true);
    expect(gate.findings.some((f) => f.rule === "tautology-ratio")).toBe(true);
    expect(gate.findings.some((f) => f.rule === "empty-test")).toBe(true);
  });

  it("passes solid tests", () => {
    const gate = runAstGate({
      config: DEFAULT_CONFIG,
      files: [{ path: "solid.test.ts", source: solidSource }],
    });
    expect(gate.pass).toBe(true);
    expect(gate.findings).toHaveLength(0);
  });

  it("fails files with zero assertions", () => {
    const gate = runAstGate({
      config: DEFAULT_CONFIG,
      files: [
        {
          path: "empty.test.ts",
          source: `it('noop', () => { const x = 1; });`,
        },
      ],
    });
    expect(gate.pass).toBe(false);
    expect(gate.findings.some((f) => f.rule === "min-assertions")).toBe(true);
  });
});
