import {
  debug,
  error,
  getLogLevel,
  info,
  resetLoggerForTests,
  setLogLevel,
  setLoggerTransportsForTests,
  warn,
  type LogLevel,
} from "../../main/logger";

describe("logger", () => {
  const lines: Array<{ level: LogLevel; message: string }> = [];

  beforeEach(() => {
    lines.length = 0;
    resetLoggerForTests();
    setLoggerTransportsForTests([
      (level, message) => {
        lines.push({ level, message });
      },
    ]);
  });

  afterEach(() => {
    resetLoggerForTests();
    delete process.env.ELECTRON_START_URL;
  });

  it("exports debug, info, warn, error", () => {
    expect(typeof debug).toBe("function");
    expect(typeof info).toBe("function");
    expect(typeof warn).toBe("function");
    expect(typeof error).toBe("function");
  });

  it("defaults to debug in development", () => {
    process.env.NODE_ENV = "development";
    resetLoggerForTests();
    expect(getLogLevel()).toBe("debug");
  });

  it("defaults to warn outside development", () => {
    process.env.NODE_ENV = "production";
    delete process.env.ELECTRON_START_URL;
    resetLoggerForTests();
    expect(getLogLevel()).toBe("warn");
  });

  it("defaults to debug when ELECTRON_START_URL is set", () => {
    process.env.NODE_ENV = "production";
    process.env.ELECTRON_START_URL = "http://localhost:5173";
    resetLoggerForTests();
    expect(getLogLevel()).toBe("debug");
  });

  it("drops messages below the configured level", () => {
    setLogLevel("warn");
    debug("noisy");
    info("also noisy");
    warn("keep");
    error("keep too");

    expect(lines).toEqual([
      { level: "warn", message: "keep" },
      { level: "error", message: "keep too" },
    ]);
  });

  it("formats additional arguments into the message", () => {
    setLogLevel("debug");
    info("hello", 42, { ok: true });

    expect(lines).toHaveLength(1);
    expect(lines[0]?.level).toBe("info");
    expect(lines[0]?.message).toContain("hello");
    expect(lines[0]?.message).toContain("42");
    expect(lines[0]?.message).toContain('"ok":true');
  });

  it("setLogLevel / getLogLevel round-trip", () => {
    setLogLevel("error");
    expect(getLogLevel()).toBe("error");
  });
});
