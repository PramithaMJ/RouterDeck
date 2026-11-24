#!/usr/bin/env node
/**
 * RouterDeck local connector: a tiny, dependency-free bridge that lets the
 * RouterDeck website talk to the router on your home network.
 *
 *   node routerdeck-connector.mjs [--origin https://your-site] [--port 47800]
 *
 * Security model
 *   - Listens on 127.0.0.1 only (not reachable from other machines).
 *   - Answers only to allow-listed website origins (CORS + Origin check).
 *   - Every request needs the pairing code printed below (sent as a header,
 *     which also forces a CORS preflight, so blind cross-site posts fail).
 *   - Will only contact private-network addresses (192.168.x.x, 10.x …).
 *   - Keeps router cookies in memory only. Nothing is written except the
 *     pairing code (~/.routerdeck/connector.json) so it survives restarts.
 *
 * Requires Node.js 18+.
 */
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { networkInterfaces, platform } from "node:os";
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const VERSION = "0.2.0";

// ------------------------------------------------------------------ options
const args = process.argv.slice(2);
function flag(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}
if (args.includes("--help") || args.includes("-h")) {
  console.log(`RouterDeck connector v${VERSION}

Usage: node routerdeck-connector.mjs [options]

  --origin <url>   Website allowed to use this connector (repeatable).
                   Default: https://router.pramitha.lk and localhost:3000
  --port <n>       Port to listen on (default 47800)
  --new-code       Generate a new pairing code
`);
  process.exit(0);
}
const PORT = Number(flag("port", process.env.ROUTERDECK_PORT || 47800));
const extraOrigins = args.flatMap((a, i) => (a === "--origin" && args[i + 1] ? [args[i + 1].replace(/\/+$/, "")] : []));
const ALLOWED_ORIGINS = new Set([
  "https://router.pramitha.lk",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  ...(process.env.ROUTERDECK_ORIGINS || "").split(",").map((s) => s.trim().replace(/\/+$/, "")).filter(Boolean),
  ...extraOrigins,
]);

// ------------------------------------------------------------------ pairing code
const CONF_DIR = join(homedir(), ".routerdeck");
const CONF_FILE = join(CONF_DIR, "connector.json");
function makeCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(12);
  const raw = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
}
let TOKEN;
try {
  if (args.includes("--new-code")) throw new Error("new");
  TOKEN = JSON.parse(readFileSync(CONF_FILE, "utf8")).token;
} catch {}
if (!TOKEN) {
  TOKEN = makeCode();
  try {
    mkdirSync(CONF_DIR, { recursive: true, mode: 0o700 });
    writeFileSync(CONF_FILE, JSON.stringify({ token: TOKEN }, null, 2), { mode: 0o600 });
  } catch {}
}

// ------------------------------------------------------------------ helpers
function isPrivateHost(host) {
  const h = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".lan") || h.endsWith(".home")) return true;
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const a = +m[1], b = +m[2];
  return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
}

/** Minimal per-origin cookie jar (name=value only, in memory). */
const jars = new Map();
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
function cookieHeader(origin) {
  const jar = jarFor(origin);
  return [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
}

const FORBIDDEN_HEADERS = new Set(["host", "cookie", "connection", "content-length", "transfer-encoding", "origin", "referer"]);

async function routerFetch(req) {
  let url;
  try {
    url = new URL(req.url);
  } catch {
    return { ok: false, error: "Invalid router address.", code: "not-allowed" };
  }
  if (!/^https?:$/.test(url.protocol) || !isPrivateHost(url.hostname)) {
    return { ok: false, error: "For safety, only devices on your home network can be reached.", code: "not-allowed" };
  }
  const method = req.method === "POST" ? "POST" : "GET";
  const headers = {};
  for (const [k, v] of Object.entries(req.headers || {})) if (!FORBIDDEN_HEADERS.has(k.toLowerCase())) headers[k] = String(v);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), Math.min(Number(req.timeoutMs) || 15000, 60000));
  try {
    let current = url;
    let body = method === "POST" ? (req.bodyBase64 ? Buffer.from(String(req.bodyBase64), "base64") : String(req.body ?? "")) : undefined;
    let m = method;
    for (let hop = 0; hop < 6; hop++) {
      const cookie = cookieHeader(current.origin);
      const res = await fetch(current, {
        method: m,
        headers: { ...headers, ...(cookie ? { cookie } : {}), referer: current.origin + "/" },
        body,
        redirect: "manual",
        signal: ctrl.signal,
      });
      storeCookies(current.origin, res);
      const loc = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && loc) {
        const next = new URL(loc, current);
        if (!isPrivateHost(next.hostname)) return { ok: false, error: "Router redirected outside your network.", code: "not-allowed" };
        current = next;
        if (res.status !== 307 && res.status !== 308) {
          m = "GET";
          body = undefined;
          delete headers["content-type"];
          delete headers["Content-Type"];
        }
        continue;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      const outHeaders0 = {};
      res.headers.forEach((v, k) => {
        if (k !== "set-cookie") outHeaders0[k] = v;
      });
      if (req.responseType === "base64") return { ok: true, result: { status: res.status, url: current.toString(), headers: outHeaders0, body: "", bodyBase64: buf.toString("base64") } };
      const charset = /charset=([\w-]+)/i.exec(res.headers.get("content-type") || "")?.[1] || "utf-8";
      let text;
      try {
        text = new TextDecoder(charset).decode(buf);
      } catch {
        text = buf.toString("utf8");
      }
      const outHeaders = {};
      res.headers.forEach((v, k) => {
        if (k !== "set-cookie") outHeaders[k] = v;
      });
      return { ok: true, result: { status: res.status, url: current.toString(), headers: outHeaders, body: text } };
    }
    return { ok: false, error: "Too many redirects from the router.", code: "unknown" };
  } catch (e) {
    if (e.name === "AbortError") return { ok: false, error: "The router took too long to answer.", code: "timeout" };
    return { ok: false, error: "The router could not be reached. Is this computer on your home network?", code: "unreachable" };
  } finally {
    clearTimeout(timer);
  }
}

// ------------------------------------------------------------------ discovery
function run(cmd, cmdArgs) {
  return new Promise((resolve) => execFile(cmd, cmdArgs, { timeout: 3000 }, (err, stdout) => resolve(err ? "" : String(stdout))));
}

/** The computer's default gateway is almost always the home router. */
async function defaultGateway() {
  const os = platform();
  let out = "";
  if (os === "darwin") {
    out = await run("route", ["-n", "get", "default"]);
    return /gateway:\s*([\d.]+)/.exec(out)?.[1];
  }
  if (os === "win32") {
    out = await run("powershell", ["-NoProfile", "-Command", "(Get-NetRoute -DestinationPrefix 0.0.0.0/0 | Sort-Object RouteMetric | Select-Object -First 1).NextHop"]);
    return /([\d]+\.[\d]+\.[\d]+\.[\d]+)/.exec(out)?.[1];
  }
  out = await run("ip", ["route", "show", "default"]);
  return /default via ([\d.]+)/.exec(out)?.[1];
}

function localIp() {
  for (const list of Object.values(networkInterfaces()))
    for (const i of list || []) if (i.family === "IPv4" && !i.internal && isPrivateHost(i.address)) return i.address;
  return undefined;
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

// ------------------------------------------------------------------ server
function send(res, status, data, origin) {
  const headers = { "content-type": "application/json", "cache-control": "no-store", vary: "Origin" };
  if (origin && ALLOWED_ORIGINS.has(origin)) headers["access-control-allow-origin"] = origin;
  res.writeHead(status, headers);
  res.end(JSON.stringify(data));
}

function readBody(req, limit = 2_000_000) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error("too large"));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

const server = createServer(async (req, res) => {
  const origin = req.headers.origin;
  const path = (req.url || "/").split("?")[0];

  // CORS preflight (+ Private Network Access / Local Network Access)
  if (req.method === "OPTIONS") {
    if (!origin || !ALLOWED_ORIGINS.has(origin)) {
      res.writeHead(403);
      return res.end();
    }
    res.writeHead(204, {
      "access-control-allow-origin": origin,
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "content-type, x-routerdeck-token",
      "access-control-allow-private-network": "true",
      "access-control-max-age": "600",
      vary: "Origin",
    });
    return res.end();
  }

  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    log("blocked", `request from unknown website ${origin}`);
    return send(res, 403, { ok: false, error: "This website is not allowed. Start the connector with --origin " + origin, code: "not-allowed" });
  }

  if (req.method === "GET" && path === "/v1/hello") return send(res, 200, { app: "routerdeck-connector", version: VERSION }, origin);

  if (req.method !== "POST") return send(res, 404, { ok: false, error: "Not found" }, origin);
  if (req.headers["x-routerdeck-token"] !== TOKEN) return send(res, 401, { ok: false, error: "Wrong pairing code.", code: "unauthorized" }, origin);

  let payload = {};
  try {
    payload = JSON.parse((await readBody(req)) || "{}");
  } catch {
    return send(res, 400, { ok: false, error: "Bad request" }, origin);
  }

  if (path === "/v1/verify") return send(res, 200, { ok: true, result: { version: VERSION } }, origin);
  if (path === "/v1/network") {
    const gw = await defaultGateway();
    return send(res, 200, { ok: true, result: { gateway: gw && isPrivateHost(gw) ? gw : undefined, localIp: localIp() } }, origin);
  }
  if (path === "/v1/probe") return send(res, 200, { ok: true, result: await probe(payload.origins, payload.timeoutMs) }, origin);
  if (path === "/v1/reset") {
    if (payload.origin) jars.delete(String(payload.origin));
    return send(res, 200, { ok: true, result: null }, origin);
  }
  if (path === "/v1/request") {
    const started = Date.now();
    const out = await routerFetch(payload);
    let p = "";
    try {
      p = new URL(payload.url).pathname;
    } catch {}
    log(payload.method || "GET", `${p} → ${out.ok ? out.result.status : out.code} (${Date.now() - started}ms)`);
    return send(res, 200, out, origin);
  }
  return send(res, 404, { ok: false, error: "Not found" }, origin);
});

const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
function log(kind, msg) {
  console.log(dim(new Date().toLocaleTimeString()), kind.padEnd(7), msg);
}

server.on("error", (e) => {
  if (e.code === "EADDRINUSE") console.error(`Port ${PORT} is already in use. Is the connector already running?`);
  else console.error(e);
  process.exit(1);
});

server.listen(PORT, "127.0.0.1", () => {
  const site = extraOrigins[0] || [...ALLOWED_ORIGINS].find((o) => o.startsWith("https://")) || "http://localhost:3000";
  console.log(`
  ${bold("RouterDeck connector")} v${VERSION} ${green("● running")} on http://127.0.0.1:${PORT}

  Pairing code:  ${bold(TOKEN)}
  Or open:       ${site}/#pair=${TOKEN}

  ${dim("Allowed websites: " + [...ALLOWED_ORIGINS].join(", "))}
  ${dim("Keep this window open while you use RouterDeck. Ctrl+C to stop.")}
`);
});
