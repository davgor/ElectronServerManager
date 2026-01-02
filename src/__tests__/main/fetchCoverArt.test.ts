/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-namespace */

import { fetchCoverArt } from "../../main/steamDetection";

type FetchFn = (input: string, init?: unknown) => Promise<{ ok: boolean }>;

declare global {
  // augment NodeJS global for tests so fetch has a typed signature
  namespace NodeJS {
    interface Global {
      fetch?: FetchFn;
    }
  }
}

describe("fetchCoverArt", () => {
  beforeEach(() => {
    // ensure there's no leftover fetch between tests
    // @ts-expect-error intentionally undefine global.fetch for tests
    global.fetch = undefined;
    jest.resetAllMocks();
  });

  it("returns URL when HEAD request is OK", async (): Promise<void> => {
    const fakeFetch: FetchFn = () => Promise.resolve({ ok: true });
    Object.defineProperty(global, "fetch", { value: fakeFetch, configurable: true });

    const url = await fetchCoverArt(12345);

    expect(typeof url).toBe("string");
    expect(url).toContain("12345");
  });

  it("returns undefined when HEAD request is not OK", async (): Promise<void> => {
    const fakeFetch2: FetchFn = () => Promise.resolve({ ok: false });
    Object.defineProperty(global, "fetch", { value: fakeFetch2, configurable: true });

    const url = await fetchCoverArt(12345);

    expect(url).toBeUndefined();
  });

  it("returns undefined when fetch throws", async (): Promise<void> => {
    const fakeFetch3: FetchFn = () => Promise.reject(new Error("Network error"));
    Object.defineProperty(global, "fetch", { value: fakeFetch3, configurable: true });

    const url = await fetchCoverArt(12345);

    expect(url).toBeUndefined();
  });
});
