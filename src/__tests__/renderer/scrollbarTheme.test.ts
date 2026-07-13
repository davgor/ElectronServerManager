import fs from "fs";
import path from "path";

describe("themed discrete scrollbar", () => {
  const cssPath = path.join(__dirname, "../../renderer/index.css");
  const css = fs.readFileSync(cssPath, "utf8");

  it("defines thin Firefox scrollbar styling on the document", () => {
    expect(css).toMatch(/scrollbar-width:\s*thin/);
    expect(css).toMatch(/scrollbar-color:/);
  });

  it("defines discrete webkit scrollbar thumb and track rules", () => {
    expect(css).toMatch(/::-webkit-scrollbar\b/);
    expect(css).toMatch(/::-webkit-scrollbar-track\b/);
    expect(css).toMatch(/::-webkit-scrollbar-thumb\b/);
    expect(css).toMatch(/::-webkit-scrollbar-thumb:hover\b/);
  });
});
