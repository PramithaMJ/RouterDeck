import type { NetworkInfo, RouterRequest, RouterResponse, Transport } from "./types";
import { isPrivateHost, TransportError } from "./types";

/**
 * Talks to the router through the user's own router tab (see lib/bridge.ts).
 * That tab opened this one, so we reach it via window.opener + postMessage.
 */
let bridgeOrigin: string | null = null;
let seq = 0;

function opener(): Window | null {
  try {
    return typeof window !== "undefined" && window.opener && !window.opener.closed ? (window.opener as Window) : null;
  } catch {
    return null;
  }
}

function call<T>(type: string, payload: unknown, timeoutMs: number, target = bridgeOrigin): Promise<T> {
  const win = opener();
  if (!win || !target) return Promise.reject(new TransportError("The router tab was closed. Open your router page and click the RouterDeck bookmark again.", "unavailable"));
  return new Promise<T>((resolve, reject) => {
    const id = `t${Date.now().toString(36)}${++seq}`;
    const timer = window.setTimeout(() => {
      window.removeEventListener("message", onMsg);
      reject(new TransportError("The router tab didn't answer. Is it still open?", "timeout"));
    }, timeoutMs);
    function onMsg(ev: MessageEvent) {
      if (ev.source !== win) return;
      if (target !== "*" && ev.origin !== target) return;
      const m = ev.data;
      if (!m || m.source !== "routerdeck-tab" || m.id !== id) return;
      if (target === "*") {
        // First contact: only accept a bridge running on a private-network origin.
        try {
          if (!isPrivateHost(new URL(ev.origin).hostname)) return;
        } catch {
          return;
        }
        bridgeOrigin = ev.origin;
      }
      window.clearTimeout(timer);
      window.removeEventListener("message", onMsg);
      if (m.ok) resolve(m.result as T);
      else reject(new TransportError(m.error, m.code ?? "unknown"));
    }
    window.addEventListener("message", onMsg);
    win.postMessage({ source: "routerdeck-app", type, id, payload }, target);
  });
}

/** Resolves with the router origin when this tab was opened by the bookmark. */
export async function detectTabBridge(timeoutMs = 1200): Promise<{ origin: string } | null> {
  if (!opener()) return null;
  try {
    const r = await call<{ origin: string }>("hello", null, timeoutMs, bridgeOrigin ?? "*");
    return { origin: r.origin };
  } catch {
    return null;
  }
}

export function tabBridgeOrigin() {
  return bridgeOrigin;
}

export class TabTransport implements Transport {
  readonly kind = "tab" as const;
  readonly label = "Router tab";

  request(req: RouterRequest): Promise<RouterResponse> {
    return call<RouterResponse>("request", req, (req.timeoutMs ?? 15000) + 3000);
  }

  async resetSession(): Promise<void> {}

  async probe(origins: string[]): Promise<string[]> {
    return origins.filter((o) => o === bridgeOrigin);
  }

  async network(): Promise<NetworkInfo> {
    return bridgeOrigin ? { gateway: new URL(bridgeOrigin).host } : {};
  }
}
