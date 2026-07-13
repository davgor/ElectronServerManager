import {
  clampPalworldOpsIntervalSeconds,
  DEFAULT_PALWORLD_OPS_INTERVAL_SECONDS,
  MAX_PALWORLD_OPS_INTERVAL_SECONDS,
  MIN_PALWORLD_OPS_INTERVAL_SECONDS,
  resolvePalworldOpsIntervalSeconds,
  shouldPollPalworldOps,
} from "../../renderer/palworldOpsSettings";

describe("palworldOpsSettings", () => {
  it("clamps interval to min/max and defaults non-finite values", () => {
    expect(clampPalworldOpsIntervalSeconds(1)).toBe(
      MIN_PALWORLD_OPS_INTERVAL_SECONDS
    );
    expect(clampPalworldOpsIntervalSeconds(999)).toBe(
      MAX_PALWORLD_OPS_INTERVAL_SECONDS
    );
    expect(clampPalworldOpsIntervalSeconds(7.9)).toBe(7);
    expect(clampPalworldOpsIntervalSeconds(Number.NaN)).toBe(
      DEFAULT_PALWORLD_OPS_INTERVAL_SECONDS
    );
  });

  it("resolves undefined to the default interval", () => {
    expect(resolvePalworldOpsIntervalSeconds(undefined)).toBe(
      DEFAULT_PALWORLD_OPS_INTERVAL_SECONDS
    );
    expect(resolvePalworldOpsIntervalSeconds(12)).toBe(12);
  });

  it("only polls when all gates are open", () => {
    expect(
      shouldPollPalworldOps({
        isPalworld: true,
        isRunning: true,
        restEnabled: true,
        opsEnabled: true,
      })
    ).toBe(true);

    expect(
      shouldPollPalworldOps({
        isPalworld: true,
        isRunning: false,
        restEnabled: true,
        opsEnabled: true,
      })
    ).toBe(false);

    expect(
      shouldPollPalworldOps({
        isPalworld: true,
        isRunning: true,
        restEnabled: false,
        opsEnabled: true,
      })
    ).toBe(false);

    expect(
      shouldPollPalworldOps({
        isPalworld: true,
        isRunning: true,
        restEnabled: true,
        opsEnabled: false,
      })
    ).toBe(false);

    expect(
      shouldPollPalworldOps({
        isPalworld: false,
        isRunning: true,
        restEnabled: true,
        opsEnabled: true,
      })
    ).toBe(false);
  });
});
