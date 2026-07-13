/** Defaults and clamps for Palworld live ops polling (epic 020). */

export const DEFAULT_PALWORLD_OPS_INTERVAL_SECONDS = 5;
export const MIN_PALWORLD_OPS_INTERVAL_SECONDS = 2;
export const MAX_PALWORLD_OPS_INTERVAL_SECONDS = 60;

export function clampPalworldOpsIntervalSeconds(seconds: number): number {
  if (!Number.isFinite(seconds)) {
    return DEFAULT_PALWORLD_OPS_INTERVAL_SECONDS;
  }
  const truncated = Math.trunc(seconds);
  if (truncated < MIN_PALWORLD_OPS_INTERVAL_SECONDS) {
    return MIN_PALWORLD_OPS_INTERVAL_SECONDS;
  }
  if (truncated > MAX_PALWORLD_OPS_INTERVAL_SECONDS) {
    return MAX_PALWORLD_OPS_INTERVAL_SECONDS;
  }
  return truncated;
}

export function resolvePalworldOpsIntervalSeconds(
  value: number | undefined
): number {
  if (value === undefined) {
    return DEFAULT_PALWORLD_OPS_INTERVAL_SECONDS;
  }
  return clampPalworldOpsIntervalSeconds(value);
}

export function shouldPollPalworldOps(options: {
  isPalworld: boolean;
  isRunning: boolean;
  restEnabled: boolean;
  opsEnabled: boolean;
}): boolean {
  return (
    options.isPalworld &&
    options.isRunning &&
    options.restEnabled &&
    options.opsEnabled
  );
}
