import { resolveIsDev } from "../../main/devEnv";

describe("resolveIsDev", () => {
  it("is true only when NODE_ENV is exactly development", () => {
    expect(resolveIsDev({ NODE_ENV: "development" })).toBe(true);
    expect(resolveIsDev({ NODE_ENV: "production" })).toBe(false);
    expect(resolveIsDev({ NODE_ENV: "test" })).toBe(false);
    expect(resolveIsDev({})).toBe(false);
  });

  it("is true when ELECTRON_START_URL is a non-empty string", () => {
    expect(
      resolveIsDev({ NODE_ENV: "production", ELECTRON_START_URL: "http://x" })
    ).toBe(true);
    expect(resolveIsDev({ ELECTRON_START_URL: "1" })).toBe(true);
  });

  it("treats empty ELECTRON_START_URL as falsy", () => {
    expect(
      resolveIsDev({ NODE_ENV: "production", ELECTRON_START_URL: "" })
    ).toBe(false);
  });
});
