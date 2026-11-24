// RouterDeck desktop: talks to the router on the home network directly from
// the main process (no browser CORS limits). Same rules as the connector:
// private-network addresses only, cookies kept in memory per router.
"use strict";

const { execFile } = require("node:child_process");
const os = require("node:os");

function isPrivateHost(host) {
  const h = String(host).replace(/^\[|\]$/g, "").toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".lan") || h.endsWith(".home")) return true;
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const a = +m[1], b = +m[2];
  return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
}

const jars = new Map(); // origin -> Map(name -> value)
function jarFor(origin) {
  if (!jars.has(origin)) jars.set(origin, new Map());
  return jars.get(origin);
}
function storeCookies(origin, res) {
  const list = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  const jar = jarFor(origin);
  for (const c of list) {
    const [pair, ...attrs] = c.split(";");
    const eq = pair.indexOf("=");
    if (eq < 1) continue;
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    const expired = attrs.some((a) => /^\s*max-age\s*=\s*(0|-)/i.test(a)) || attrs.some((a) => /^\s*expires\s*=/i.test(a) && Date.parse(a.split("=")[1]) < Date.now());
    if (expired || value === "") jar.delete(name);
    else jar.set(name, value);
  }
}
const cookieHeader = (origin) => [...jarFor(origin)].map(([k, v]) => `${k}=${v}`).join("; ");

const FORBIDDEN = new Set(["host", "cookie", "connection", "content-length", "transfer-encoding", "origin", "referer"]);

class RouterRequestError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

async function routerFetch(req) {
  let url;
  try {
    url = new URL(req.url);
  } catch {
    throw new RouterRequestError("Invalid router address.", "not-allowed");
  }
  if (!/^https?:$/.test(url.protocol) || !isPrivateHost(url.hostname)) {
    throw new RouterRequestError("For safety, only devices on your home network can be reached.", "not-allowed");
  }
  const headers = {};
  for (const [k, v] of Object.entries(req.headers || {})) if (!FORBIDDEN.has(k.toLowerCase())) headers[k] = String(v);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), Math.min(Number(req.timeoutMs) || 15000, 60000));
  try {
    let current = url;
    let method = req.method === "POST" ? "POST" : "GET";
    let body = method === "POST" ? (req.bodyBase64 ? Buffer.from(String(req.bodyBase64), "base64") : String(req.body ?? "")) : undefined;
    for (let hop = 0; hop < 6; hop++) {
      const cookie = cookieHeader(current.origin);
      const res = await fetch(current, {
        method,
        headers: { ...headers, ...(cookie ? { cookie } : {}), referer: current.origin + "/" },
        body,
        redirect: "manual",
        signal: ctrl.signal,
      });
      storeCookies(current.origin, res);
      const loc = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && loc) {
        const next = new URL(loc, current);
        if (!isPrivateHost(next.hostname)) throw new RouterRequestError("Router redirected outside your network.", "not-allowed");
        current = next;
        if (res.status !== 307 && res.status !== 308) {
          method = "GET";
          body = undefined;
          delete headers["content-type"];
          delete headers["Content-Type"];
        }
        continue;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      const outHeaders = {};
      res.headers.forEach((v, k) => {
        if (k !== "set-cookie") outHeaders[k] = v;
      });
      if (req.responseType === "base64") return { status: res.status, url: current.toString(), headers: outHeaders, body: "", bodyBase64: buf.toString("base64") };
      const charset = /charset=([\w-]+)/i.exec(res.headers.get("content-type") || "")?.[1] || "utf-8";
      let text;
      try {
        text = new TextDecoder(charset).decode(buf);
      } catch {
        text = buf.toString("utf8");
      }
      return { status: res.status, url: current.toString(), headers: outHeaders, body: text };
    }
    throw new RouterRequestError("Too many redirects from the router.", "unknown");
  } catch (e) {
    if (e instanceof RouterRequestError) throw e;
    if (e && e.name === "AbortError") throw new RouterRequestError("The router took too long to answer.", "timeout");
    throw new RouterRequestError("The router could not be reached. Is this computer on your home network?", "unreachable");
  } finally {
    clearTimeout(timer);
  }
}

async function probe(origins, timeoutMs) {
  const list = (Array.isArray(origins) ? origins : []).slice(0, 16).filter((o) => {
    try {
      const u = new URL(o);
      return /^https?:$/.test(u.protocol) && isPrivateHost(u.hostname);
    } catch {
      return false;
    }
  });
  const found = await Promise.all(
    list.map(async (o) => {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), Math.min(Number(timeoutMs) || 1500, 5000));
      try {
        await fetch(o + "/", { redirect: "manual", signal: ctrl.signal });
        return o;
      } catch {
        return null;
      } finally {
        clearTimeout(t);
      }
    }),
  );
  return found.filter(Boolean);
}

function run(cmd, args) {
  return new Promise((resolve) => execFile(cmd, args, { timeout: 3000 }, (err, stdout) => resolve(err ? "" : String(stdout))));
}

async function defaultGateway() {
  const p = os.platform();
  if (p === "darwin") return /gateway:\s*([\d.]+)/.exec(await run("route", ["-n", "get", "default"]))?.[1];
  if (p === "win32") {
    const out = await run("powershell", ["-NoProfile", "-Command", "(Get-NetRoute -DestinationPrefix 0.0.0.0/0 | Sort-Object RouteMetric | Select-Object -First 1).NextHop"]);
    return /(\d+\.\d+\.\d+\.\d+)/.exec(out)?.[1];
  }
  return /default via ([\d.]+)/.exec(await run("ip", ["route", "show", "default"]))?.[1];
}

function localIp() {
  for (const list of Object.values(os.networkInterfaces()))
    for (const i of list || []) if (i.family === "IPv4" && !i.internal && isPrivateHost(i.address)) return i.address;
  return undefined;
}

async function network() {
  const gw = await defaultGateway();
  return { gateway: gw && isPrivateHost(gw) ? gw : undefined, localIp: localIp() };
}

function reset(origin) {
  if (origin) jars.delete(String(origin));
}

module.exports = { routerFetch, probe, network, reset, isPrivateHost, localIp };
