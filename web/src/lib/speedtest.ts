/**
 * Browser speed test against Cloudflare's public speed endpoints
 * (the same ones speed.cloudflare.com uses). No backend needed.
 *
 *  latency  20 × GET /__down?bytes=0 (server processing time removed)
 *  download 4 parallel streams for ~10 s, live throughput from stream reads
 *  upload   4 parallel POSTs of growing size for ~8 s
 *  loaded   latency sampled while downloading (bufferbloat indicator)
 */
const BASE = "https://speed.cloudflare.com";

export type Phase = "idle" | "meta" | "latency" | "download" | "upload" | "done" | "error";

export interface SpeedMeta {
  ip?: string;
  isp?: string;
  asn?: number;
  city?: string;
  country?: string;
  colo?: string;
}

export interface SpeedResult {
  at: number;
  downloadMbps: number;
  uploadMbps: number;
  pingMs: number;
  jitterMs: number;
  loadedPingMs?: number;
  bytesUsed: number;
  meta: SpeedMeta;
}

export interface SpeedProgress {
  phase: Phase;
  /** Current live value: ms during latency, Mbps during download/upload. */
  live: number;
  /** 0..1 progress of the current phase. */
  progress: number;
  samples: { phase: Phase; v: number }[];
  partial: Partial<SpeedResult>;
}

const now = () => performance.now();

function serverMs(res: Response): number {
  const t = res.headers.get("server-timing") ?? "";
  const m = /dur=([\d.]+)/.exec(t);
  return m ? Number(m[1]) : 0;
}

function median(a: number[]) {
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function jitter(a: number[]) {
  if (a.length < 2) return 0;
  let sum = 0;
  for (let i = 1; i < a.length; i++) sum += Math.abs(a[i] - a[i - 1]);
  return sum / (a.length - 1);
}

async function ping(signal: AbortSignal): Promise<number> {
  const t0 = now();
  const res = await fetch(`${BASE}/__down?bytes=0&r=${Math.random()}`, { cache: "no-store", signal });
  await res.arrayBuffer();
  return Math.max(1, now() - t0 - serverMs(res));
}

export async function runSpeedTest(onProgress: (p: SpeedProgress) => void, signal: AbortSignal): Promise<SpeedResult> {
  const samples: SpeedProgress["samples"] = [];
  const partial: Partial<SpeedResult> = {};
  let bytesUsed = 0;
  const emit = (phase: Phase, live: number, progress: number) => onProgress({ phase, live, progress, samples: samples.slice(-240), partial: { ...partial } });

  // ---- meta
  emit("meta", 0, 0);
  let meta: SpeedMeta = {};
  try {
    const j = await (await fetch(`${BASE}/meta`, { cache: "no-store", signal })).json();
    meta = { ip: j.clientIp, isp: j.asOrganization, asn: j.asn, city: j.city, country: j.country, colo: typeof j.colo === "string" ? j.colo : j.colo?.iata };
  } catch (e) {
    if (signal.aborted) throw e;
  }
  partial.meta = meta;

  // ---- latency (2 warm-up requests open the connection; not counted)
  for (let i = 0; i < 2; i++) await ping(signal).catch(() => 0);
  const pings: number[] = [];
  for (let i = 0; i < 20; i++) {
    const p = await ping(signal);
    pings.push(p);
    samples.push({ phase: "latency", v: p });
    partial.pingMs = Math.round(median(pings) * 10) / 10;
    partial.jitterMs = Math.round(jitter(pings) * 10) / 10;
    emit("latency", p, (i + 1) / 20);
  }

  // ---- download
  const DL_MS = 10_000;
  let dlBytes = 0;
  const dlStart = now();
  let lastT = dlStart, lastB = 0;
  const loaded: number[] = [];
  const dlCtrl = new AbortController();
  const stopDl = () => dlCtrl.abort();
  signal.addEventListener("abort", stopDl);
  const stream = async () => {
    let size = 1_000_000;
    while (now() - dlStart < DL_MS && !dlCtrl.signal.aborted) {
      try {
        const res = await fetch(`${BASE}/__down?bytes=${size}&r=${Math.random()}`, { cache: "no-store", signal: dlCtrl.signal });
        const reader = res.body!.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          dlBytes += value.byteLength;
          if (now() - dlStart > DL_MS) {
            await reader.cancel();
            break;
          }
        }
        size = Math.min(size * 2, 50_000_000);
      } catch {
        break;
      }
    }
  };
  const ticker = setInterval(() => {
    const t = now();
    const mbps = ((dlBytes - lastB) * 8) / ((t - lastT) / 1000) / 1e6;
    lastT = t;
    lastB = dlBytes;
    samples.push({ phase: "download", v: mbps });
    const total = ((dlBytes * 8) / ((t - dlStart) / 1000)) / 1e6;
    partial.downloadMbps = Math.round(total * 10) / 10;
    emit("download", mbps, Math.min(1, (t - dlStart) / DL_MS));
  }, 200);
  const loadedPinger = (async () => {
    await new Promise((r) => setTimeout(r, 1500));
    while (now() - dlStart < DL_MS - 500 && !dlCtrl.signal.aborted) {
      try {
        loaded.push(await ping(dlCtrl.signal));
      } catch {
        break;
      }
      await new Promise((r) => setTimeout(r, 400));
    }
  })();
  await Promise.all([stream(), stream(), stream(), stream()]);
  clearInterval(ticker);
  dlCtrl.abort();
  await loadedPinger.catch(() => undefined);
  signal.removeEventListener("abort", stopDl);
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
  const dlSecs = Math.min(DL_MS, now() - dlStart) / 1000;
  // Ignore TCP ramp-up: use the faster of whole-run average and steady-state samples (p90).
  const dlLive = samples.filter((s) => s.phase === "download").map((s) => s.v).slice(5);
  const p90 = dlLive.length ? [...dlLive].sort((a, b) => a - b)[Math.floor(dlLive.length * 0.9) - 1] ?? 0 : 0;
  const avg = (dlBytes * 8) / dlSecs / 1e6;
  partial.downloadMbps = Math.round(Math.max(avg, Math.min(p90, avg * 1.25)) * 10) / 10;
  partial.loadedPingMs = loaded.length ? Math.round(median(loaded)) : undefined;
  bytesUsed += dlBytes;
  emit("download", partial.downloadMbps, 1);

  // ---- upload
  const UL_MS = 8_000;
  let ulBytes = 0;
  const ulStart = now();
  let ulLastT = ulStart, ulLastB = 0;
  const ulTicker = setInterval(() => {
    const t = now();
    const mbps = ((ulBytes - ulLastB) * 8) / ((t - ulLastT) / 1000) / 1e6;
    ulLastT = t;
    ulLastB = ulBytes;
    if (mbps > 0) samples.push({ phase: "upload", v: mbps });
    partial.uploadMbps = Math.round((((ulBytes * 8) / ((t - ulStart) / 1000)) / 1e6) * 10) / 10;
    emit("upload", mbps > 0 ? mbps : partial.uploadMbps ?? 0, Math.min(1, (t - ulStart) / UL_MS));
  }, 250);
  const blob = new Uint8Array(8_000_000);
  crypto.getRandomValues(blob.subarray(0, 65536));
  const uploader = async () => {
    let size = 250_000;
    while (now() - ulStart < UL_MS && !signal.aborted) {
      try {
        await fetch(`${BASE}/__up?r=${Math.random()}`, { method: "POST", body: blob.subarray(0, size), signal, cache: "no-store" });
        ulBytes += size;
        size = Math.min(size * 2, blob.length);
      } catch {
        break;
      }
    }
  };
  await Promise.all([uploader(), uploader(), uploader(), uploader()]);
  clearInterval(ulTicker);
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
  partial.uploadMbps = Math.round((((ulBytes * 8) / ((now() - ulStart) / 1000)) / 1e6) * 10) / 10;
  bytesUsed += ulBytes;

  const result: SpeedResult = {
    at: Date.now(),
    downloadMbps: partial.downloadMbps ?? 0,
    uploadMbps: partial.uploadMbps ?? 0,
    pingMs: partial.pingMs ?? 0,
    jitterMs: partial.jitterMs ?? 0,
    loadedPingMs: partial.loadedPingMs,
    bytesUsed,
    meta,
  };
  partial.bytesUsed = bytesUsed;
  emit("done", result.downloadMbps, 1);
  return result;
}

// ------------------------------------------------------------ history

const HISTORY_KEY = "routerdeck.speedtests.v1";

export function loadHistory(): SpeedResult[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function saveResult(r: SpeedResult) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify([r, ...loadHistory()].slice(0, 20)));
  } catch {}
}

export function clearHistory() {
  try {
    localStorage.removeItem(HISTORY_KEY);
  } catch {}
}

/** Plain-language verdicts shown under the results. */
export function verdict(r: SpeedResult) {
  const out: { label: string; ok: boolean }[] = [];
  out.push({ label: "HD video streaming", ok: r.downloadMbps >= 5 });
  out.push({ label: "4K streaming", ok: r.downloadMbps >= 25 });
  out.push({ label: "Video calls (Zoom, Teams)", ok: r.uploadMbps >= 3 && r.downloadMbps >= 3 && r.pingMs < 150 });
  out.push({ label: "Online gaming", ok: r.pingMs < 60 && r.jitterMs < 20 });
  out.push({ label: "Large downloads", ok: r.downloadMbps >= 50 });
  return out;
}
