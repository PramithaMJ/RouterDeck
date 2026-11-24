/** Public address of the hosted app (used in setup commands and QR codes). */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://router.pramitha.lk").replace(/\/+$/, "");

export const CONNECTOR_DOWNLOAD = `${SITE_URL}/downloads/routerdeck-connector.mjs`;

/** True on phones/tablets (touch-first, small screens). */
export function isMobileDevice(): boolean {
  if (typeof window === "undefined") return false;
  const ua = navigator.userAgent;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua) && window.innerWidth < 1100);
}

export function isAndroid(): boolean {
  return typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);
}
