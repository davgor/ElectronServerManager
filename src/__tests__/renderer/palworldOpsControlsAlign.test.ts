import fs from "fs";
import path from "path";

describe("palworld ops controls alignment", () => {
  const cssPath = path.join(__dirname, "../../renderer/PalworldOpsPanel.css");
  const css = fs.readFileSync(cssPath, "utf8");

  it("clears auto-restart checkbox top margin inside ops controls row", () => {
    expect(css).toMatch(
      /\.palworld-ops-controls\s+\.auto-restart-checkbox\s*\{[^}]*margin-top:\s*0/
    );
  });
});
