/** Default cap so a chatty dedicated server cannot grow the buffer forever. */
const DEFAULT_SERVER_OUTPUT_CAP = 16_384;

const buffers = new Map<number, string>();

export function resetServerOutputBuffersForTests(): void {
  buffers.clear();
}

export function clearServerOutput(appId: number): void {
  buffers.delete(appId);
}

export function appendServerOutput(
  appId: number,
  chunk: string,
  maxChars: number = DEFAULT_SERVER_OUTPUT_CAP
): void {
  const previous = buffers.get(appId) ?? "";
  let next = previous + chunk;
  if (next.length > maxChars) {
    next = next.slice(next.length - maxChars);
  }
  buffers.set(appId, next);
}

export function getServerOutput(appId: number): string {
  return buffers.get(appId) ?? "";
}
