/** Normalizes any MAC format (AABBCC..., aa-bb-.., aa:bb:..) to aa:bb:cc:dd:ee:ff. */
export function normalizeMac(input: string): string | null {
  const hex = input.toLowerCase().replace(/[^0-9a-f]/g, "");
  if (hex.length !== 12) return null;
  return hex.match(/.{2}/g)!.join(":");
}

export const MAC_RE = /\b([0-9a-f]{2}[:-]){5}[0-9a-f]{2}\b|\b[0-9a-f]{12}\b/i;

/** Locally administered = randomized "private Wi-Fi address" (iOS/Android/Windows). */
export function isRandomizedMac(mac: string): boolean {
  const first = parseInt(mac.slice(0, 2), 16);
  return Number.isFinite(first) && (first & 0x02) === 0x02;
}

export function compactMac(mac: string) {
  return mac.replace(/:/g, "").toUpperCase();
}

/** Serializes ordered pairs exactly like a browser's urlencoded form body. */
export function encodeForm(pairs: [string, string][]): string {
  return new URLSearchParams(pairs).toString();
}

export function parsePercent(s?: string): number | undefined {
  const m = s?.match(/(-?\d+(?:\.\d+)?)\s*%/);
  return m ? Number(m[1]) : undefined;
}

export function parseNumber(s?: string): number | undefined {
  const m = s?.match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : undefined;
}

/** Serializes async work: routers handle one admin action at a time. */
export class Mutex {
  private tail: Promise<unknown> = Promise.resolve();
  run<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.tail.then(fn, fn);
    this.tail = result.catch(() => undefined);
    return result;
  }
}

export function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
