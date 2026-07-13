import fs from "fs";
import path from "path";

function readCompiled(relativePath: string): string {
  const filePath = path.join(__dirname, "../../../dist/main", relativePath);
  expect(fs.existsSync(filePath)).toBe(true);
  return fs.readFileSync(filePath, "utf-8");
}

describe("Main Process Build", () => {
  it("should compile main.ts to CommonJS without errors", () => {
    expect(
      fs.existsSync(path.join(__dirname, "../../../dist/main/main.js"))
    ).toBe(true);
  });

  it("should produce CommonJS output (uses require, not import)", () => {
    const content = readCompiled("main.js");

    expect(content).toContain('require("');
    expect(content).not.toMatch(/^import\s+/m);
    expect(content).toContain("exports");
  });

  it("should not use import.meta.url in compiled output", () => {
    const content = readCompiled("main.js");
    expect(content).not.toContain("import.meta.url");
  });

  it("should use process.env for development detection in bootstrap", () => {
    const content = readCompiled("main.js");
    expect(content).toContain("process.env.NODE_ENV");
  });

  it("should bootstrap app lifecycle and IPC registration only", () => {
    const content = readCompiled("main.js");

    expect(content).toContain("registerAppLifecycle");
    expect(content).toContain("registerIpcHandlers");
    expect(content).toContain("setApplicationMenu(null)");
    expect(content).toContain("initCatalog");
  });

  it("should use __dirname in appWindow for preload and renderer paths", () => {
    const content = readCompiled("appWindow.js");
    expect(content).toContain("__dirname");
  });

  it("should compile steam detection into the IPC module graph", () => {
    const registerContent = readCompiled("registerIpcHandlers.js");
    const steamIpcContent = readCompiled("steamIpc.js");

    expect(registerContent).toContain("steamIpc");
    expect(steamIpcContent).toContain("steamDetection");
  });
});
