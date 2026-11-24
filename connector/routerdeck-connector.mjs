#!/usr/bin/env node
/**
 * RouterDeck local connector: a tiny, dependency-free bridge that lets the
 * RouterDeck website talk to the router on your home network.
 *
 *   node routerdeck-connector.mjs            # this computer only
 *   node routerdeck-connector.mjs --lan      # also phones/tablets on your Wi-Fi
 *
 * It also serves the RouterDeck app itself at http://<this-computer>:47800,
 * which is how phones use RouterDeck (phone browsers can't run extensions).
 * On Android it can run on the phone itself with Termux.
 *
 * Security model
 *   - Listens on 127.0.0.1 only, unless --lan is given.
 *   - Rejects requests whose Host isn't an IP/localhost (DNS-rebinding guard).
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
import { createRequire } from "node:module";
import { execFile } from "node:child_process";
import { networkInterfaces, platform } from "node:os";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { extname, join, normalize, resolve, sep } from "node:path";

const VERSION = "0.4.0";

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
  --lan            Also accept phones/tablets on your Wi-Fi (needs the pairing code)
  --local-only     Only this computer (default for the script; the app shares with phones)
  --open / --no-open  Open RouterDeck in the browser at start (the app does by default)
  --app <url|dir>  Where the app is served from (default https://router.pramitha.lk,
                   or a folder with a RouterDeck build, e.g. web/out)
  --new-code       Generate a new pairing code
`);
  process.exit(0);
}
const PORT = Number(flag("port", process.env.ROUTERDECK_PORT || 47800));
// The packaged app (RouterDeck Connect for Windows/Mac/Linux) shares with phones by default.
function detectPackaged() {
  try {
    const req = typeof require === "function" ? require : createRequire(import.meta.url);
    return !!req("node:sea").isSea();
  } catch {
    return false;
  }
}
const PACKAGED = detectPackaged();
const LAN = !args.includes("--local-only") && (args.includes("--lan") || process.env.ROUTERDECK_LAN === "1" || PACKAGED);
const OPEN_BROWSER = !args.includes("--no-open") && process.env.ROUTERDECK_NO_OPEN !== "1" && (PACKAGED || args.includes("--open"));
const APP_SOURCE = flag("app", process.env.ROUTERDECK_APP || "https://router.pramitha.lk");
const APP_DIR = !/^https?:\/\//.test(APP_SOURCE) && existsSync(APP_SOURCE) ? resolve(APP_SOURCE) : null;
const APP_URL = APP_DIR ? null : APP_SOURCE.replace(/\/+$/, "");
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
  if (origin && isAllowedOrigin(origin)) headers["access-control-allow-origin"] = origin;
  res.writeHead(status, headers);
  res.end(JSON.stringify(data));
}

// ------------------------------------------------------------------ own origins / guards
function ownOrigins() {
  const hosts = ["127.0.0.1", "localhost"];
  if (LAN) for (const list of Object.values(networkInterfaces())) for (const i of list || []) if (i.family === "IPv4" && !i.internal) hosts.push(i.address);
  return new Set(hosts.map((h) => `http://${h}:${PORT}`));
}
function isAllowedOrigin(origin) {
  return ALLOWED_ORIGINS.has(origin) || ownOrigins().has(origin);
}
/** DNS-rebinding guard: only accept Host headers that are IPs or localhost. */
function hostOk(host) {
  const h = String(host || "").replace(/:\d+$/, "").replace(/^\[|\]$/g, "");
  return h === "localhost" || /^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.includes(":");
}
const failures = new Map(); // ip -> { n, until }
const isLoopback = (ip) => ip === "127.0.0.1" || ip === "::1" || ip === "localhost";
function lockedOut(ip) {
  const f = failures.get(ip);
  return !isLoopback(ip) && !!f && f.until > Date.now();
}
function recordFailure(ip) {
  // Websites can't reach the API without passing CORS, so guessing can only
  // come from other devices on the network. Never lock out this computer.
  if (isLoopback(ip)) return;
  const f = failures.get(ip) || { n: 0, until: 0 };
  f.n += 1;
  if (f.n >= 10) {
    f.until = Date.now() + 10 * 60_000;
    f.n = 0;
    log("blocked", `too many wrong pairing codes from ${ip}, locked for 10 minutes`);
  }
  failures.set(ip, f);
}

// ------------------------------------------------------------------ app hosting
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8", ".webmanifest": "application/manifest+json", ".zip": "application/zip", ".mjs": "text/javascript; charset=utf-8" };
const appCache = new Map(); // immutable assets from the hosted app
const APP_HEADERS = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "x-frame-options": "DENY",
  "content-security-policy":
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://icons.duckduckgo.com; font-src 'self' data:; connect-src 'self' https://speed.cloudflare.com; frame-src 'self' about:; frame-ancestors 'none'; base-uri 'none'; object-src 'none'",
};

async function serveApp(req, res, path, search) {
  if (APP_DIR) {
    let rel = decodeURIComponent(path);
    let file = normalize(join(APP_DIR, rel));
    if (file !== APP_DIR && !file.startsWith(APP_DIR + sep)) return void res.writeHead(403).end();
    try {
      if (statSync(file).isDirectory()) file = join(file, "index.html");
    } catch {
      if (!extname(file) && existsSync(file + ".html")) file += ".html";
      else if (!extname(file) && existsSync(join(file, "index.html"))) file = join(file, "index.html");
    }
    if (!existsSync(file)) file = join(APP_DIR, "404.html");
    const body = readFileSync(file);
    res.writeHead(file.endsWith("404.html") && !rel.endsWith("404.html") ? 404 : 200, {
      ...APP_HEADERS,
      "content-type": MIME[extname(file)] || "application/octet-stream",
      "cache-control": rel.startsWith("/_next/static/") ? "public, max-age=31536000, immutable" : "no-cache",
    });
    return res.end(req.method === "HEAD" ? undefined : body);
  }
  const key = path + search;
  if (appCache.has(key)) {
    const c = appCache.get(key);
    res.writeHead(200, { ...APP_HEADERS, "content-type": c.type, "cache-control": "public, max-age=31536000, immutable" });
    return res.end(c.body);
  }
  try {
    const up = await fetch(APP_URL + key, { redirect: "follow" });
    const body = Buffer.from(await up.arrayBuffer());
    const type = up.headers.get("content-type") || MIME[extname(path)] || "application/octet-stream";
    if (up.ok && path.startsWith("/_next/static/")) appCache.set(key, { body, type });
    res.writeHead(up.status, { ...APP_HEADERS, "content-type": type, "cache-control": up.headers.get("cache-control") || "no-cache" });
    res.end(req.method === "HEAD" ? undefined : body);
  } catch {
    res.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
    res.end(`RouterDeck couldn't load the app from ${APP_URL}. Check this computer's internet connection, or start with --app <folder>.`);
  }
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
  const [path, query = ""] = (req.url || "/").split("?");
  const ip = (req.socket.remoteAddress || "").replace(/^::ffff:/, "");

  if (!hostOk(req.headers.host)) {
    res.writeHead(421, { "content-type": "text/plain" });
    return res.end("Use this computer's IP address (e.g. http://192.168.1.5:" + PORT + ").");
  }

  // The RouterDeck app itself (for phones and other browsers on the LAN).
  if ((req.method === "GET" || req.method === "HEAD") && !path.startsWith("/v1/")) return serveApp(req, res, path, query ? "?" + query : "");

  // CORS preflight (+ Private Network Access / Local Network Access)
  if (req.method === "OPTIONS") {
    if (!origin || !isAllowedOrigin(origin)) {
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

  if (origin && !isAllowedOrigin(origin)) {
    log("blocked", `request from unknown website ${origin}`);
    return send(res, 403, { ok: false, error: "This website is not allowed. Start the connector with --origin " + origin, code: "not-allowed" });
  }

  if (req.method === "GET" && path === "/v1/hello") return send(res, 200, { app: "routerdeck-connector", version: VERSION }, origin);

  if (req.method !== "POST") return send(res, 404, { ok: false, error: "Not found" }, origin);
  if (lockedOut(ip)) return send(res, 429, { ok: false, error: "Too many wrong pairing codes. Try again in 10 minutes.", code: "unauthorized" }, origin);
  if (req.headers["x-routerdeck-token"] !== TOKEN) {
    recordFailure(ip);
    return send(res, 401, { ok: false, error: "The pairing code doesn't match this connector. Pair again with the code it shows.", code: "unauthorized" }, origin);
  }
  failures.delete(ip);

  let payload = {};
  try {
    payload = JSON.parse((await readBody(req)) || "{}");
  } catch {
    return send(res, 400, { ok: false, error: "Bad request" }, origin);
  }

  if (path === "/v1/verify") return send(res, 200, { ok: true, result: { version: VERSION } }, origin);
  if (path === "/v1/network") {
    const gw = await defaultGateway();
    return send(res, 200, { ok: true, result: { gateway: gw && isPrivateHost(gw) ? gw : undefined, localIp: localIp(), lan: LAN, port: PORT } }, origin);
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

server.listen(PORT, LAN ? "0.0.0.0" : "127.0.0.1", () => {
  const site = extraOrigins[0] || [...ALLOWED_ORIGINS].find((o) => o.startsWith("https://")) || "http://localhost:3000";
  const ip = localIp();
  const phone = LAN && ip ? `http://${ip}:${PORT}` : null;
  console.log(`
  ${bold("RouterDeck connector")} v${VERSION} ${green("● running")}

  Pairing code:  ${bold(TOKEN)}

  On this computer:   ${site}/#pair=${TOKEN}
                      ${dim(`or http://127.0.0.1:${PORT}/#pair=${TOKEN}`)}
${
  phone
    ? `  On your phone:      ${bold(`${phone}/#pair=${TOKEN}`)}
                      ${dim("(same Wi-Fi). Easiest: open RouterDeck on this computer → Settings → Use on your phone → scan the QR.")}`
    : `  ${dim("Want to use your phone too? Restart with --lan")}`
}

  ${dim("App served from: " + (APP_DIR ?? APP_URL))}
  ${dim("Keep this window open while you use RouterDeck. Close it (or Ctrl+C) to stop.")}
`);
  if (OPEN_BROWSER) openBrowser(`${site}/#pair=${TOKEN}`);
});

function openBrowser(url) {
  const os = platform();
  const [cmd, cmdArgs] = os === "darwin" ? ["open", [url]] : os === "win32" ? ["cmd", ["/c", "start", "", url]] : ["xdg-open", [url]];
  execFile(cmd, cmdArgs, () => undefined);
}
