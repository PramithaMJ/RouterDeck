// RouterDeck Connect – service worker.
//
// Security model
//  * Only pages listed in manifest.json content_scripts can send requests.
//  * Requests may only target private-network hosts (192.168.x.x, 10.x …).
//  * Each (website, router) pair must be approved once by the user in a
//    popup; approval also grants host permission for just that router.
//  * Nothing is stored except the list of approvals.

const APPROVALS_KEY = "approvals"; // { [siteOrigin]: string[] routerOrigins }
const pending = new Map(); // key -> resolve(boolean)

function isPrivateHost(host) {
  const h = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".lan") || h.endsWith(".home")) return true;
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const a = +m[1], b = +m[2];
  return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
}

async function getApprovals() {
  const r = await chrome.storage.local.get(APPROVALS_KEY);
  return r[APPROVALS_KEY] || {};
}

async function isApproved(site, router) {
  const all = await getApprovals();
  if (!(all[site] || []).includes(router)) return false;
  return chrome.permissions.contains({ origins: [router + "/*"] });
}

async function askApproval(site, router) {
  const key = `${site}|${router}`;
  if (pending.has(key)) return pending.get(key).promise;
  let resolve;
  const promise = new Promise((r) => (resolve = r));
  pending.set(key, { promise, resolve });
  const url = chrome.runtime.getURL(`approve.html?site=${encodeURIComponent(site)}&router=${encodeURIComponent(router)}`);
  const win = await chrome.windows.create({ url, type: "popup", width: 440, height: 560, focused: true });
  const onRemoved = (id) => {
    if (id === win.id && pending.has(key)) {
      pending.get(key).resolve(false);
      pending.delete(key);
    }
  };
  chrome.windows.onRemoved.addListener(onRemoved);
  const timer = setTimeout(() => {
    if (pending.has(key)) {
      pending.get(key).resolve(false);
      pending.delete(key);
    }
  }, 120000);
  const ok = await promise;
  clearTimeout(timer);
  chrome.windows.onRemoved.removeListener(onRemoved);
  return ok;
}

function b64ToBytes(b64) {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}
function bytesToB64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Reachability only: opaque no-cors requests need no host permission and reveal nothing but "answered". */
async function probe(origins, timeoutMs) {
  const list = (Array.isArray(origins) ? origins : []).slice(0, 16).filter((o) => {
    try {
      const u = new URL(o);
      return /^https?:$/.test(u.protocol) && isPrivateHost(u.hostname);
    } catch {
      return false;
    }
  });
  const results = await Promise.all(
    list.map(async (o) => {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), Math.min(timeoutMs || 1500, 5000));
      try {
        await fetch(o + "/", { mode: "no-cors", credentials: "omit", cache: "no-store", signal: ctrl.signal });
        return o;
      } catch {
        return null;
      } finally {
        clearTimeout(t);
      }
    }),
  );
  return { ok: true, result: results.filter(Boolean) };
}

async function routerFetch(req) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), Math.min(req.timeoutMs || 15000, 60000));
  try {
    const res = await fetch(req.url, {
      method: req.method || "GET",
      headers: req.headers || {},
      body: req.method === "POST" ? (req.bodyBase64 ? b64ToBytes(req.bodyBase64) : req.body) : undefined,
      credentials: "include",
      redirect: "follow",
      cache: "no-store",
      signal: ctrl.signal,
    });
    const headers = {};
    res.headers.forEach((v, k) => (headers[k] = v));
    const buf = await res.arrayBuffer();
    if (req.responseType === "base64") return { ok: true, result: { status: res.status, url: res.url, headers, body: "", bodyBase64: bytesToB64(buf) } };
    const charset = /charset=([\w-]+)/i.exec(headers["content-type"] || "")?.[1] || "utf-8";
    let body;
    try {
      body = new TextDecoder(charset).decode(buf);
    } catch {
      body = new TextDecoder("utf-8").decode(buf);
    }
    return { ok: true, result: { status: res.status, url: res.url, headers, body } };
  } catch (e) {
    if (e.name === "AbortError") return { ok: false, error: "The router took too long to answer.", code: "timeout" };
    return { ok: false, error: "The router could not be reached. Are you on your home network?", code: "unreachable" };
  } finally {
    clearTimeout(t);
  }
}

async function handle(msg, sender) {
  // Approval page reporting back.
  if (msg.type === "approval-result") {
    // Only our own approval page may answer (content scripts share our id, not our URL).
    if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL("approve.html"))) {
      return { ok: false, error: "Not allowed", code: "not-allowed" };
    }
    const p = pending.get(msg.key);
    if (p) {
      p.resolve(!!msg.allowed);
      pending.delete(msg.key);
    }
    return { ok: true };
  }

  const site = sender.origin || (sender.url && new URL(sender.url).origin);
  if (!site || !sender.tab) return { ok: false, error: "Unknown sender", code: "not-allowed" };

  if (msg.type === "request") {
    const req = msg.payload || {};
    let target;
    try {
      target = new URL(req.url);
    } catch {
      return { ok: false, error: "Invalid router address.", code: "not-allowed" };
    }
    if (!/^https?:$/.test(target.protocol) || !isPrivateHost(target.hostname)) {
      return { ok: false, error: "For safety, only devices on your home network can be reached.", code: "not-allowed" };
    }
    const router = target.origin;
    if (!(await isApproved(site, router))) {
      const ok = await askApproval(site, router);
      if (!ok) return { ok: false, error: "Access to your router was not allowed in the extension.", code: "not-approved" };
    }
    return routerFetch(req);
  }

  if (msg.type === "reset") return { ok: true, result: null };
  if (msg.type === "probe") return probe(msg.payload?.origins, msg.payload?.timeoutMs);

  return { ok: false, error: `Unknown request ${msg.type}`, code: "not-allowed" };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handle(msg, sender).then(sendResponse, (e) => sendResponse({ ok: false, error: String(e?.message || e), code: "unknown" }));
  return true; // async
});
