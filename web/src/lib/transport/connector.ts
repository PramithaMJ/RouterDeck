import type { NetworkInfo, RouterRequest, RouterResponse, Transport } from "./types";
import { TransportError } from "./types";

/**
 * Talks to the RouterDeck local connector (a tiny Node.js program the user
 * runs on a computer in the same network: `npx routerdeck-connector`).
 *
 * Every call carries a pairing token printed by the connector at start-up, so
 * other websites can't drive the user's router through it.
 */
export const DEFAULT_CONNECTOR_URL = "http://127.0.0.1:47800";

let detectedBase: string | null = null;

/**
 * Where the connector lives. When the app itself was served by the connector
 * (phones on the LAN: http://192.168.1.5:47800) it's simply this page's origin.
 */
export function connectorBaseUrl(): string {
  return detectedBase ?? DEFAULT_CONNECTOR_URL;
}

/** True when this page is being served by a RouterDeck connector (phone mode). */
export function servedByConnector(): boolean {
  return detectedBase !== null && typeof window !== "undefined" && detectedBase === window.location.origin;
}

async function hello(base: string, timeoutMs: number) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}/v1/hello`, { signal: ctrl.signal, cache: "no-store" });
    if (!res.ok) return null;
    const json = (await res.json()) as { app?: string; version?: string };
    return json.app === "routerdeck-connector" ? { version: json.version ?? "?" } : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Finds a running connector. If this page was served over plain http (a phone
 * opening http://<computer>:47800), the connector is this page's own origin.
 * Otherwise look for one on this computer.
 */
export async function detectConnector(timeoutMs = 800): Promise<{ version: string } | null> {
  if (typeof window !== "undefined" && window.location.protocol === "http:") {
    const same = await hello(window.location.origin, timeoutMs);
    if (same) {
      detectedBase = window.location.origin;
      return same;
    }
  }
  const r = await hello(DEFAULT_CONNECTOR_URL, timeoutMs);
  if (r) detectedBase = DEFAULT_CONNECTOR_URL;
  return r;
}

export class ConnectorTransport implements Transport {
  readonly kind = "connector" as const;
  readonly label = "Local connector";

  private readonly baseUrl: string;
  constructor(
    private readonly token: string,
    baseUrl?: string,
  ) {
    this.baseUrl = baseUrl ?? connectorBaseUrl();
  }

  private async rpc<T>(path: string, body: unknown, timeoutMs: number): Promise<T> {
    let res: Response;
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeoutMs);
      res = await fetch(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-routerdeck-token": this.token },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      clearTimeout(t);
    } catch {
      throw new TransportError("Can't reach the local connector. Is it still running?", "unavailable");
    }
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: T; error?: string; code?: string };
    if (res.status === 401) throw new TransportError("Pairing code was rejected by the connector.", "unauthorized");
    if (!json.ok) throw new TransportError(json.error ?? `Connector error (${res.status})`, (json.code as TransportError["code"]) ?? "unknown");
    return json.result as T;
  }

  /** Validates the pairing token. */
  async verify(): Promise<void> {
    await this.rpc("/v1/verify", {}, 3000);
  }

  request(req: RouterRequest): Promise<RouterResponse> {
    return this.rpc<RouterResponse>("/v1/request", req, (req.timeoutMs ?? 15000) + 2000);
  }

  async resetSession(origin: string): Promise<void> {
    await this.rpc("/v1/reset", { origin }, 3000).catch(() => undefined);
  }

  probe(origins: string[], timeoutMs = 1500): Promise<string[]> {
    return this.rpc<string[]>("/v1/probe", { origins, timeoutMs }, timeoutMs + 3000).catch(() => []);
  }

  network(): Promise<NetworkInfo> {
    return this.rpc<NetworkInfo>("/v1/network", {}, 5000).catch(() => ({}));
  }
}
