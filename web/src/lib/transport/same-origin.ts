import type { RouterRequest, RouterResponse, Transport } from "./types";
import { TransportError } from "./types";

/**
 * Plain fetch(). Only works when the app itself is served from the router's
 * origin or from the local connector (which then proxies same-origin).
 * Also used by the in-router test harness.
 */
export class SameOriginTransport implements Transport {
  readonly kind = "same-origin" as const;
  readonly label = "Direct";

  async request(req: RouterRequest): Promise<RouterResponse> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), req.timeoutMs ?? 15000);
    try {
      const res = await fetch(req.url, {
        method: req.method ?? "GET",
        headers: req.headers,
        body: req.bodyBase64 ? Uint8Array.from(atob(req.bodyBase64), (c) => c.charCodeAt(0)) : req.body,
        credentials: "include",
        redirect: "follow",
        signal: ctrl.signal,
      });
      const headers: Record<string, string> = {};
      res.headers.forEach((v, k) => (headers[k] = v));
      if (req.responseType === "base64") {
        const bytes = new Uint8Array(await res.arrayBuffer());
        let bin = "";
        for (const b of bytes) bin += String.fromCharCode(b);
        return { status: res.status, url: res.url, headers, body: "", bodyBase64: btoa(bin) };
      }
      return { status: res.status, url: res.url, headers, body: await res.text() };
    } catch (e) {
      if ((e as Error).name === "AbortError") throw new TransportError("The router took too long to answer.", "timeout");
      throw new TransportError("The router could not be reached.", "unreachable");
    } finally {
      clearTimeout(t);
    }
  }
}
