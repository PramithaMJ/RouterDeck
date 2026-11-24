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

export async function detectConnector(baseUrl = DEFAULT_CONNECTOR_URL, timeoutMs = 800): Promise<{ version: string } | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(`${baseUrl}/v1/hello`, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return null;
    const json = (await res.json()) as { app?: string; version?: string };
    return json.app === "routerdeck-connector" ? { version: json.version ?? "?" } : null;
  } catch {
    return null;
  }
}

export class ConnectorTransport implements Transport {
  readonly kind = "connector" as const;
  readonly label = "Local connector";

  constructor(
    private readonly token: string,
    private readonly baseUrl = DEFAULT_CONNECTOR_URL,
  ) {}

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
