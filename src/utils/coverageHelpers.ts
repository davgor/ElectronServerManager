export function add(a: number, b: number): number {
  return a + b;
}

export function multiply(a: number, b: number): number {
  return a * b;
}

export function isEven(n: number): boolean {
  return n % 2 === 0;
}

export function parseSimpleINI(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith(";") || trimmed.startsWith("#") || trimmed.startsWith("[")) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.substring(0, idx).trim();
    const value = trimmed.substring(idx + 1).trim();
    out[key] = value;
  }
  return out;
}
