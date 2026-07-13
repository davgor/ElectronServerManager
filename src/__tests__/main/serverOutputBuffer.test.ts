import {
  appendServerOutput,
  clearServerOutput,
  getServerOutput,
  resetServerOutputBuffersForTests,
} from "../../main/serverOutputBuffer";

describe("serverOutputBuffer", () => {
  beforeEach(() => {
    resetServerOutputBuffersForTests();
  });

  it("returns empty string when nothing was appended", () => {
    expect(getServerOutput(123)).toBe("");
  });

  it("appends chunks for an appId", () => {
    appendServerOutput(42, "hello ");
    appendServerOutput(42, "world");
    expect(getServerOutput(42)).toBe("hello world");
  });

  it("keeps buffers isolated per appId", () => {
    appendServerOutput(1, "one");
    appendServerOutput(2, "two");
    expect(getServerOutput(1)).toBe("one");
    expect(getServerOutput(2)).toBe("two");
  });

  it("caps total retained characters", () => {
    appendServerOutput(7, "a".repeat(100), 50);
    expect(getServerOutput(7).length).toBe(50);
    expect(getServerOutput(7)).toBe("a".repeat(50));
  });

  it("clearServerOutput removes only that appId", () => {
    appendServerOutput(1, "keep");
    appendServerOutput(2, "drop");
    clearServerOutput(2);
    expect(getServerOutput(1)).toBe("keep");
    expect(getServerOutput(2)).toBe("");
  });
});
