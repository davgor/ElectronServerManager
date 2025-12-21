import fs from "fs";
import path from "path";

describe("Main Process Build", () => {
  it("should compile main.ts to CommonJS without errors", () => {
    // This test verifies that the main process compiles to CommonJS format
    // Required for Electron to load the main process without ES module errors
    const mainJsPath = path.join(__dirname, "../../../dist/main/main.js");

    expect(fs.existsSync(mainJsPath)).toBe(true);
  });

  it("should produce CommonJS output (uses require, not import)", () => {
    // Verify that the compiled main.js uses CommonJS format (require/exports)
    // This prevents "Cannot use import statement outside a module" errors
    const mainJsPath = path.join(__dirname, "../../../dist/main/main.js");

    const content = fs.readFileSync(mainJsPath, "utf-8");

    // Should use require() for imports
    expect(content).toContain('require("');

    // Should not use import statement at the top level
    expect(content).not.toMatch(/^import\s+/m);

    // Should use exports or module.exports
    expect(content).toContain("exports");
  });

  it("should not use import.meta.url in compiled output", () => {
    // import.meta.url is ESM-only and causes errors in CommonJS
    // The main.ts should use process.env checks instead
    const mainJsPath = path.join(__dirname, "../../../dist/main/main.js");

    const content = fs.readFileSync(mainJsPath, "utf-8");

    // Should not have import.meta.url which only works in ESM
    expect(content).not.toContain("import.meta.url");
  });

  it("should use process.env for development detection", () => {
    // Instead of using electron-is-dev (ESM module),
    // main.ts should check process.env.NODE_ENV
    const mainJsPath = path.join(__dirname, "../../../dist/main/main.js");

    const content = fs.readFileSync(mainJsPath, "utf-8");

    // Should check process.env for development mode
    expect(content).toContain("process.env.NODE_ENV");
  });

  it("should declare __dirname for CommonJS compatibility", () => {
    // In CommonJS, __dirname is available globally
    // The main.ts should declare it for TypeScript compatibility
    const mainJsPath = path.join(__dirname, "../../../dist/main/main.js");

    const content = fs.readFileSync(mainJsPath, "utf-8");

    // Should have __dirname variable or global reference
    expect(content).toContain("__dirname");
  });

  it("should compile all steam detection imports", () => {
    // Verify that steamDetection.ts is properly imported in the compiled output
    const mainJsPath = path.join(__dirname, "../../../dist/main/main.js");

    const content = fs.readFileSync(mainJsPath, "utf-8");

    // Should require steamDetection module
    expect(content).toContain("steamDetection");
  });
});
