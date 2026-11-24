/**
 * Realtek "Boa" firmwares sign every form with a hidden `postSecurityFlag`.
 * Normally the router page computes it itself (we run the page's own JS),
 * this is only a fallback for forms whose button does not trigger signing.
 *
 * Reverse-engineered black-box from an SLT HG7 (v1.0.18) and verified against
 * 70+ probes: the urlencoded string "k1=v1&k2=v2&" (trailing &) is summed as
 * big-endian 32-bit words (mod 2^32), folded once to 16 bits and inverted.
 */
export function postSecurityFlag(pairs: [string, string][]): number {
  const signed = pairs
    .filter(([k]) => k !== "postSecurityFlag")
    .map(([k, v]) => new URLSearchParams([[k, v]]).toString() + "&")
    .join("");
  const bytes = new TextEncoder().encode(signed);
  let sum = 0;
  for (let i = 0; i < bytes.length; i += 4) {
    const word = ((bytes[i] << 24) >>> 0) + ((bytes[i + 1] ?? 0) << 16) + ((bytes[i + 2] ?? 0) << 8) + (bytes[i + 3] ?? 0);
    sum = (sum + word) % 0x100000000;
  }
  const folded = ((sum >>> 16) + (sum & 0xffff)) & 0xffff;
  return ~folded & 0xffff;
}
