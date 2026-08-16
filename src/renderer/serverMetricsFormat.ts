const MIB = 1024 * 1024;
const GIB = 1024 * MIB;

/** Formats a CPU percentage with one decimal, e.g. `12.3%`. */
export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

/** Formats bytes as MiB (one decimal) or GiB (two decimals) above 1 GiB. */
export function formatBytes(bytes: number): string {
  if (bytes >= GIB) {
    return `${(bytes / GIB).toFixed(2)} GiB`;
  }
  return `${(bytes / MIB).toFixed(1)} MiB`;
}
