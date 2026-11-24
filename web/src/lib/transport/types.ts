/**
 * A Transport is a dumb, session-aware pipe from the browser to a router on
 * the user's local network.
 *
 * Why this exists: a website served from the internet (Cloudflare) cannot
 * talk to http://192.168.1.1 directly. The browser blocks it (mixed content,
 * CORS, Private Network Access) and a cloud server can't reach a LAN address
 * at all. So all router traffic goes through something that runs *on the
 * user's machine*: the RouterDeck browser extension or the local connector.
 *
 * Transports only move bytes. All router-specific knowledge lives in drivers.
 */
export type TransportKind = "desktop" | "extension" | "connector" | "tab" | "same-origin" | "demo";

export interface RouterRequest {
  /** Absolute URL, e.g. http://192.168.1.1/status.asp */
  url: string;
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  /** Already-encoded request body (e.g. application/x-www-form-urlencoded). */
  body?: string;
  /** Binary request body (base64). Takes precedence over `body`. */
  bodyBase64?: string;
  /** "base64" returns the raw response bytes in `bodyBase64` (e.g. gRPC). */
  responseType?: "text" | "base64";
  /** Milliseconds before the request is aborted. Default 15s. */
  timeoutMs?: number;
}

export interface RouterResponse {
  status: number;
  /** Final URL after redirects. */
  url: string;
  headers: Record<string, string>;
  body: string;
  bodyBase64?: string;
}

export interface NetworkInfo {
  /** Default gateway of the computer running the bridge, if known. */
  gateway?: string;
  localIp?: string;
  /** Connector started with --lan (phones on the Wi-Fi can use it). */
  lan?: boolean;
  port?: number;
}

export interface Transport {
  readonly kind: TransportKind;
  /** Human-friendly name shown in the UI. */
  readonly label: string;
  request(req: RouterRequest): Promise<RouterResponse>;
  /** Forget cookies/session for a router origin (used on logout). */
  resetSession?(origin: string): Promise<void>;
  /** Which of these origins answer at all (no permissions needed). */
  probe?(origins: string[], timeoutMs?: number): Promise<string[]>;
  /** Network facts the bridge can see (connector: real default gateway). */
  network?(): Promise<NetworkInfo>;
}

export class TransportError extends Error {
  constructor(
    message: string,
    readonly code:
      | "unreachable"
      | "timeout"
      | "not-allowed"
      | "not-approved"
      | "unauthorized"
      | "unavailable"
      | "unknown" = "unknown",
  ) {
    super(message);
    this.name = "TransportError";
  }
}

/** Only RFC1918 / link-local / CGNAT-free private hosts may be targeted. */
export function isPrivateHost(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".lan") || h.endsWith(".home")) return true;
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return (
    a === 10 ||
    a === 127 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254)
  );
}
