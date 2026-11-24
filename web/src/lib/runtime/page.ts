import type { Transport } from "../transport/types";
import { AGENT_SOURCE } from "./agent";

export interface FieldSnapshot {
  name: string;
  id: string;
  type: string;
  value: string;
  disabled: boolean;
  visible: boolean;
  label: string;
  /** Label of the table row the field sits in (e.g. "Mode"). */
  group?: string;
  maxLength?: number;
  readOnly?: boolean;
  checked?: boolean;
  text?: string;
  options?: { value: string; label: string; selected: boolean }[];
}

export interface FormSnapshot {
  index: number;
  name: string;
  action: string;
  method: string;
  fields: FieldSnapshot[];
}

export interface RowSnapshot {
  cells: string[];
  inputs: { name: string; type: string; value: string; checked: boolean }[];
  header: boolean;
  visible: boolean;
}

export interface TableSnapshot {
  index: number;
  id: string;
  rows: RowSnapshot[];
}

export interface PageSnapshot {
  title: string;
  text: string;
  forms: FormSnapshot[];
  tables: TableSnapshot[];
  alerts: string[];
}

export interface CapturedSubmit {
  submitted: boolean;
  form?: string;
  action?: string;
  method?: string;
  pairs?: [string, string][];
  alerts: string[];
}

export interface SubmitSpec {
  form: string | number;
  /** Name, id or visible label of the button to click. Omit to submit directly. */
  button?: string;
  values?: Record<string, string | boolean | string[]>;
  /** Order in which values are applied (some pages enable fields on change). */
  order?: string[];
}

/** Per-origin cache of external router scripts (common.js, md5.js …). */
const scriptCache = new Map<string, Promise<string>>();

function randomNonce() {
  const a = new Uint8Array(12);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Renders a router page inside a throw-away sandboxed iframe so the router's
 * own JavaScript can run against it, then lets us inspect and drive it.
 */
export class RouterPage {
  private constructor(
    readonly url: string,
    private readonly iframe: HTMLIFrameElement,
    private readonly channel: string,
  ) {}

  private seq = 0;

  static async open(transport: Transport, url: string, opts: { html?: string } = {}): Promise<RouterPage> {
    const html = opts.html ?? (await transport.request({ url })).body;
    const doc = new DOMParser().parseFromString(html, "text/html");

    // Inline external scripts (they would otherwise resolve against our origin).
    const scripts = Array.from(doc.querySelectorAll("script[src]"));
    await Promise.all(
      scripts.map(async (s) => {
        const src = new URL(s.getAttribute("src") ?? "", url);
        src.search = ""; // cache-busting params (?v=123) are irrelevant
        const key = src.toString();
        if (!scriptCache.has(key)) {
          scriptCache.set(
            key,
            transport
              .request({ url: key })
              .then((r) => (r.status >= 200 && r.status < 300 ? r.body : ""))
              .catch(() => ""),
          );
        }
        const code = await scriptCache.get(key)!;
        const inline = doc.createElement("script");
        // Keep </script> inside code from terminating the tag.
        inline.textContent = code.replace(/<\/script/gi, "<\\/script");
        s.replaceWith(inline);
      }),
    );

    // Nothing in the sandbox may load anything from the network.
    doc.querySelectorAll("link, iframe, frame, object, embed, base").forEach((n) => n.remove());
    doc.querySelectorAll("img").forEach((n) => n.removeAttribute("src"));

    const channel = randomNonce();
    const csp = doc.createElement("meta");
    csp.setAttribute("http-equiv", "Content-Security-Policy");
    csp.setAttribute("content", "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; img-src data:; form-action 'none'");
    const agent = doc.createElement("script");
    agent.textContent = AGENT_SOURCE.replace("__CHANNEL__", channel);
    const head = doc.head ?? doc.documentElement.insertBefore(doc.createElement("head"), doc.body);
    head.prepend(csp, agent);

    const iframe = document.createElement("iframe");
    iframe.setAttribute("sandbox", "allow-scripts allow-forms");
    iframe.setAttribute("aria-hidden", "true");
    iframe.tabIndex = -1;
    iframe.style.cssText = "position:fixed;left:-12000px;top:0;width:1280px;height:900px;border:0;visibility:hidden;pointer-events:none";

    const ready = new Promise<void>((resolve) => {
      const timer = window.setTimeout(done, 8000);
      function done() {
        window.clearTimeout(timer);
        window.removeEventListener("message", onMsg);
        resolve();
      }
      function onMsg(ev: MessageEvent) {
        if (ev.source === iframe.contentWindow && ev.data?.channel === channel && ev.data?.type === "ready") done();
      }
      window.addEventListener("message", onMsg);
    });

    iframe.srcdoc = "<!DOCTYPE html>" + doc.documentElement.outerHTML;
    document.body.appendChild(iframe);
    await ready;
    return new RouterPage(url, iframe, channel);
  }

  private rpc<T>(op: string, payload: Record<string, unknown> = {}, timeoutMs = 10000): Promise<T> {
    const win = this.iframe.contentWindow;
    if (!win) return Promise.reject(new Error("Router page is closed"));
    const id = `${++this.seq}`;
    return new Promise<T>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        window.removeEventListener("message", onMsg);
        reject(new Error(`Router page did not respond (${op})`));
      }, timeoutMs);
      const onMsg = (ev: MessageEvent) => {
        if (ev.source !== win) return;
        const m = ev.data;
        if (!m || m.channel !== this.channel || m.id !== id) return;
        window.clearTimeout(timer);
        window.removeEventListener("message", onMsg);
        if (m.ok) resolve(m.data as T);
        else reject(new Error(String(m.data)));
      };
      window.addEventListener("message", onMsg);
      // Opaque-origin sandbox: "*" is the only possible target origin.
      win.postMessage({ channel: this.channel, id, op, ...payload }, "*");
    });
  }

  snapshot(): Promise<PageSnapshot> {
    return this.rpc<PageSnapshot>("snapshot");
  }

  /** Set fields like a user would (page scripts react), then re-snapshot. */
  fill(form: string | number, values: Record<string, string | boolean | string[]>): Promise<PageSnapshot> {
    return this.rpc<PageSnapshot>("fill", { form, values });
  }

  globals(names: string[]): Promise<Record<string, unknown>> {
    return this.rpc("globals", { names });
  }

  /** Fills a form, clicks a button and captures the request the page would send. */
  capture(spec: SubmitSpec): Promise<CapturedSubmit> {
    return this.rpc<CapturedSubmit>("submit", { ...spec }, 15000);
  }

  dispose() {
    this.iframe.remove();
  }
}

/** Helper: open → fn → always dispose. */
export async function withPage<T>(transport: Transport, url: string, fn: (p: RouterPage) => Promise<T>): Promise<T> {
  const page = await RouterPage.open(transport, url);
  try {
    return await fn(page);
  } finally {
    page.dispose();
  }
}
