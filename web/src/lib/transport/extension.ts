import type { NetworkInfo, RouterRequest, RouterResponse, Transport } from "./types";
import { TransportError } from "./types";

/**
 * Talks to the RouterDeck browser extension through window.postMessage.
 * The extension's content script relays messages to its service worker,
 * which has host permission for private-network addresses and performs the
 * actual fetch (with the browser's own cookie jar for the router).
 */
const SOURCE_APP = "routerdeck-app";
const SOURCE_EXT = "routerdeck-ext";

type ExtMessage =
  | { source: typeof SOURCE_EXT; type: "ready"; version: string }
  | { source: typeof SOURCE_EXT; type: "response"; id: string; ok: true; result: unknown }
  | { source: typeof SOURCE_EXT; type: "response"; id: string; ok: false; error: string; code?: string };

let seq = 0;
const nextId = () => `${Date.now().toString(36)}-${(++seq).toString(36)}`;

function call<T>(type: string, payload: unknown, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = nextId();
    const timer = window.setTimeout(() => {
      window.removeEventListener("message", onMessage);
      reject(new TransportError("The RouterDeck extension did not answer in time.", "timeout"));
    }, timeoutMs);
    function onMessage(ev: MessageEvent) {
      if (ev.source !== window) return;
      const m = ev.data as ExtMessage;
      if (!m || m.source !== SOURCE_EXT || m.type !== "response" || m.id !== id) return;
      window.clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      if (m.ok) resolve(m.result as T);
      else reject(new TransportError(m.error, (m.code as TransportError["code"]) ?? "unknown"));
    }
    window.addEventListener("message", onMessage);
    window.postMessage({ source: SOURCE_APP, type, id, payload }, window.location.origin);
  });
}

/** Resolves with the extension version, or null if it isn't installed. */
export async function detectExtension(timeoutMs = 600): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const marked = document.documentElement.dataset.routerdeckExtension;
  if (marked) return marked;
  try {
    const res = await call<{ version: string }>("hello", null, timeoutMs);
    return res.version;
  } catch {
    return null;
  }
}

export class ExtensionTransport implements Transport {
  readonly kind = "extension" as const;
  readonly label = "Browser extension";

  async request(req: RouterRequest): Promise<RouterResponse> {
    return call<RouterResponse>("request", req, (req.timeoutMs ?? 15000) + 60000 /* allow time for approval popup */);
  }

  async resetSession(origin: string): Promise<void> {
    await call("reset", { origin }, 5000).catch(() => undefined);
  }

  async probe(origins: string[], timeoutMs = 1500): Promise<string[]> {
    return call<string[]>("probe", { origins, timeoutMs }, timeoutMs + 3000).catch(() => []);
  }

  async network(): Promise<NetworkInfo> {
    return {};
  }
}
