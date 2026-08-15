import { unzipSync } from "fflate";

/**
 * Read a zip archive into a map of forward-slash paths → file bytes.
 * Directory entries are omitted.
 */
export function readZipEntries(
  zipBytes: Uint8Array
): Record<string, Buffer> {
  const unzipped = unzipSync(zipBytes);
  const out: Record<string, Buffer> = {};
  for (const [rawPath, data] of Object.entries(unzipped)) {
    const normalized = rawPath.replace(/\\/g, "/");
    if (!normalized || normalized.endsWith("/")) {
      continue;
    }
    out[normalized] = Buffer.from(data);
  }
  return out;
}
