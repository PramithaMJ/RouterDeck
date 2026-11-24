"use client";

import { ArrowDown, ArrowUp, Check, Gauge, Globe, History, Laptop, MapPin, RotateCcw, Square, Timer, Trash2, Waves, X, Zap } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { PageHeader } from "@/components/app-shell";
import { IspLogo } from "@/components/isp-badge";
import { SpeedChart, SpeedGauge } from "@/components/speed-gauge";
import { Button, Card, cn, CopyButton, Notice } from "@/components/ui";
import { detectIsp, ispById } from "@/lib/isp";
import { clearHistory, loadHistory, runSpeedTest, saveResult, verdict, type Phase, type SpeedProgress, type SpeedResult } from "@/lib/speedtest";

function deviceLabel() {
  if (typeof navigator === "undefined") return "This device";
  const ua = navigator.userAgent;
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "Unknown OS";
  const br = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  return `${br} on ${os}`;
}

function connectionLabel() {
  const c = (navigator as Navigator & { connection?: { type?: string; effectiveType?: string } }).connection;
  if (!c) return undefined;
  if (c.type === "wifi") return "Wi-Fi";
  if (c.type === "ethernet") return "Cable";
  if (c.type === "cellular") return "Mobile data";
  return undefined;
}

const STEPS: { phase: Phase; label: string; icon: typeof Timer }[] = [
  { phase: "latency", label: "Ping", icon: Timer },
  { phase: "download", label: "Download", icon: ArrowDown },
  { phase: "upload", label: "Upload", icon: ArrowUp },
];

function Stat({ icon, label, value, unit, hint, active, tone }: { icon: React.ReactNode; label: string; value?: number; unit: string; hint?: string; active?: boolean; tone?: string }) {
  return (
    <div className={cn("rounded-xl border p-4 transition", active ? "border-[var(--text)] surface" : "border-subtle surface")}>
      <div className="label-caps flex items-center gap-1.5">
        <span className={tone}>{icon}</span>
        {label}
      </div>
      <div className="mt-1.5 flex items-baseline gap-1">
        <span className="font-mono text-[1.6rem] font-medium tracking-[-0.02em]">{value === undefined ? "–" : value >= 100 ? Math.round(value) : value.toFixed(1)}</span>
        <span className="text-[13px] text-muted">{unit}</span>
      </div>
      {hint && <p className="mt-0.5 text-[11.5px] text-muted">{hint}</p>}
    </div>
  );
}

export default function SpeedTestPage() {
  const [p, setP] = useState<SpeedProgress | null>(null);
  const [result, setResult] = useState<SpeedResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<SpeedResult[]>([]);
  const [device, setDevice] = useState({ label: "This device", conn: undefined as string | undefined });
  const ctrl = useRef<AbortController | null>(null);

  useEffect(() => {
    setHistory(loadHistory());
    setDevice({ label: deviceLabel(), conn: connectionLabel() });
    return () => ctrl.current?.abort();
  }, []);

  const running = !!p && p.phase !== "done" && p.phase !== "error" && !result;

  async function start() {
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    setResult(null);
    setError(null);
    setP({ phase: "meta", live: 0, progress: 0, samples: [], partial: {} });
    try {
      const r = await runSpeedTest(setP, c.signal);
      setResult(r);
      saveResult(r);
      setHistory(loadHistory());
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError("The test couldn't finish. Check your internet connection and try again.");
      setP(null);
    }
  }

  function stop() {
    ctrl.current?.abort();
    setP(null);
  }

  const phase = result ? "done" : p?.phase ?? "idle";
  const partial = result ?? p?.partial ?? {};
  const meta = (result?.meta ?? p?.partial.meta) || {};
  const ispId = detectIsp({ text: meta.isp ?? "", asn: meta.asn });
  const isp = ispById(ispId);

  const gauge = useMemo(() => {
    if (phase === "latency") return { value: p?.live ?? 0, unit: "ms", label: "Ping", tone: "amber" as const };
    if (phase === "upload") return { value: p?.live ?? 0, unit: "Mbps", label: "Upload", tone: "emerald" as const };
    if (phase === "download") return { value: p?.live ?? 0, unit: "Mbps", label: "Download", tone: "brand" as const };
    if (phase === "done" && result) return { value: result.downloadMbps, unit: "Mbps", label: "Download", tone: "brand" as const };
    return { value: 0, unit: "Mbps", label: phase === "meta" ? "Connecting" : undefined, tone: "brand" as const };
  }, [phase, p, result]);

  const chartSamples = (p?.samples ?? []).filter((s) => s.phase === (phase === "upload" ? "upload" : "download")).map((s) => s.v);
  const stepIndex = STEPS.findIndex((s) => s.phase === phase);

  return (
    <>
      <PageHeader title="Speed test" description="Measure the internet speed this device gets through your network." />

      <div className="grid gap-5 lg:grid-cols-[1.05fr_1fr]">
        <Card className="relative overflow-hidden p-5 sm:p-7">

          {/* Steps */}
          <ol className="relative mb-2 grid grid-cols-3 gap-2">
            {STEPS.map((s, i) => {
              const done = phase === "done" || (stepIndex > i && stepIndex !== -1);
              const active = s.phase === phase;
              return (
                <li key={s.phase} className="space-y-1.5">
                  <div className={cn("flex items-center gap-1.5 text-[12.5px] font-medium", active ? "text-[var(--text)]" : done ? "text-emerald-600 dark:text-emerald-400" : "text-muted")}>
                    {done ? <Check className="size-3.5" /> : <s.icon className="size-3.5" />}
                    {s.label}
                  </div>
                  <div className="h-1 overflow-hidden rounded-full bg-[var(--surface-2)]">
                    <div className={cn("h-full rounded-full transition-[width] duration-300", done ? "bg-emerald-500" : "bg-brand-500")} style={{ width: `${done ? 100 : active ? Math.round((p?.progress ?? 0) * 100) : 0}%` }} />
                  </div>
                </li>
              );
            })}
          </ol>

          <div className="relative">
            <SpeedGauge value={gauge.value} unit={gauge.unit} label={gauge.label} tone={gauge.tone} active={running} hideReadout={phase === "idle"} />
            {phase === "idle" && (
              <div className="absolute inset-0 flex items-center justify-center">
                <button
                  onClick={start}
                  className="bg-ink group relative flex size-36 items-center justify-center rounded-full shadow-pop transition hover:scale-[1.03] active:scale-95"
                  aria-label="Start speed test"
                >
                  <span className="absolute -inset-2 animate-ping rounded-full border border-brand-500/40 [animation-duration:2.4s]" />
                  <span className="absolute -inset-3 rounded-full border border-[var(--border)]" />
                  <span className="relative font-mono text-[26px] font-medium tracking-[0.18em]">GO</span>
                </button>
              </div>
            )}
          </div>

          <div className="mt-1 h-24">{(phase === "download" || phase === "upload" || phase === "done") && <SpeedChart samples={chartSamples} tone={phase === "upload" ? "emerald" : "brand"} />}</div>

          <div className="mt-4 flex justify-center gap-2">
            {running && (
              <Button variant="secondary" onClick={stop}>
                <Square className="size-4" /> Stop
              </Button>
            )}
            {phase === "done" && (
              <Button onClick={start} size="lg">
                <RotateCcw className="size-4" /> Test again
              </Button>
            )}
          </div>
          {error && (
            <Notice tone="red" className="mt-4">
              {error}
            </Notice>
          )}
        </Card>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Stat icon={<ArrowDown className="size-4" />} tone="text-brand-500" label="Download" value={partial.downloadMbps} unit="Mbps" active={phase === "download"} />
            <Stat icon={<ArrowUp className="size-4" />} tone="text-emerald-500" label="Upload" value={partial.uploadMbps} unit="Mbps" active={phase === "upload"} />
            <Stat icon={<Timer className="size-4" />} tone="text-amber-500" label="Ping" value={partial.pingMs} unit="ms" hint="Idle latency" active={phase === "latency"} />
            <Stat icon={<Waves className="size-4" />} tone="text-sky-500" label="Jitter" value={partial.jitterMs} unit="ms" hint="Latency variation" active={phase === "latency"} />
            <Stat icon={<Zap className="size-4" />} tone="text-rose-500" label="Loaded ping" value={partial.loadedPingMs} unit="ms" hint="While downloading" />
            <Stat icon={<Gauge className="size-4" />} tone="text-violet-500" label="Data used" value={partial.bytesUsed ? partial.bytesUsed / 1e6 : undefined} unit="MB" />
          </div>

          <Card className="divide-y divide-[var(--border)]">
            <div className="flex items-center gap-3 px-4 py-3">
              {isp ? <IspLogo isp={isp} /> : <span className="flex size-9 items-center justify-center rounded-xl bg-[var(--surface-2)] text-muted"><Globe className="size-[18px]" /></span>}
              <div className="min-w-0 flex-1">
                <p className="text-[12px] text-muted">Provider</p>
                <p className="truncate text-[14px] font-medium">{isp?.name ?? meta.isp ?? "–"}</p>
              </div>
              {meta.ip && (
                <span className="flex items-center gap-1 font-mono text-[12px] text-muted">
                  {meta.ip.length > 18 ? meta.ip.slice(0, 18) + "…" : meta.ip}
                  <CopyButton value={meta.ip} label="Copy IP" />
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 px-4 py-3">
              <span className="flex size-9 items-center justify-center rounded-xl bg-[var(--surface-2)] text-muted">
                <MapPin className="size-[18px]" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[12px] text-muted">Test server</p>
                <p className="truncate text-[14px] font-medium">{meta.colo ? `Cloudflare ${meta.colo}` : "Cloudflare (nearest)"}</p>
              </div>
              <span className="text-[12px] text-muted">{[meta.city, meta.country].filter(Boolean).join(", ")}</span>
            </div>
            <div className="flex items-center gap-3 px-4 py-3">
              <span className="flex size-9 items-center justify-center rounded-xl bg-[var(--surface-2)] text-muted">
                <Laptop className="size-[18px]" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[12px] text-muted">Testing from</p>
                <p className="truncate text-[14px] font-medium">{device.label}</p>
              </div>
              {device.conn && <span className="text-[12px] text-muted">{device.conn}</span>}
            </div>
          </Card>

          {result && (
            <Card className="animate-slide-up p-4">
              <p className="mb-2.5 text-[13px] font-semibold">What this connection is good for</p>
              <ul className="grid gap-1.5 sm:grid-cols-2">
                {verdict(result).map((v) => (
                  <li key={v.label} className="flex items-center gap-2 text-[13px]">
                    {v.ok ? <Check className="size-4 text-emerald-500" /> : <X className="size-4 text-rose-500" />}
                    <span className={v.ok ? "" : "text-muted"}>{v.label}</span>
                  </li>
                ))}
              </ul>
              {result.loadedPingMs && result.loadedPingMs > result.pingMs * 3 && result.loadedPingMs - result.pingMs > 60 && (
                <p className="mt-3 text-[12.5px] text-amber-700 dark:text-amber-300">Latency jumps a lot when the line is busy (bufferbloat). Calls may stutter while someone downloads.</p>
              )}
            </Card>
          )}
        </div>
      </div>

      {history.length > 0 && (
        <Card className="mt-5">
          <div className="flex items-center justify-between px-5 pt-5 sm:px-6">
            <h2 className="flex items-center gap-2 text-[15px] font-semibold">
              <History className="size-4 text-muted" /> Recent tests
            </h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                clearHistory();
                setHistory([]);
              }}
            >
              <Trash2 className="size-4" /> Clear
            </Button>
          </div>
          <div className="overflow-x-auto px-2 pb-3 pt-2 sm:px-3">
            <table className="w-full min-w-[520px] text-left text-[13.5px]">
              <thead className="text-[12px] text-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">When</th>
                  <th className="px-3 py-2 font-medium">Download</th>
                  <th className="px-3 py-2 font-medium">Upload</th>
                  <th className="px-3 py-2 font-medium">Ping</th>
                  <th className="px-3 py-2 font-medium">Provider</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.at} className="border-t border-subtle">
                    <td className="px-3 py-2.5 text-muted">{new Date(h.at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</td>
                    <td className="px-3 py-2.5 font-medium tabular-nums">{h.downloadMbps} Mbps</td>
                    <td className="px-3 py-2.5 font-medium tabular-nums">{h.uploadMbps} Mbps</td>
                    <td className="px-3 py-2.5 tabular-nums">{h.pingMs} ms</td>
                    <td className="max-w-[160px] truncate px-3 py-2.5 text-muted">{ispById(detectIsp({ text: h.meta.isp ?? "", asn: h.meta.asn }))?.name ?? h.meta.isp ?? "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <p className="mt-4 px-1 text-[12px] text-muted">Tests run against Cloudflare&apos;s global network from your browser. A full test uses roughly 100–500 MB depending on your speed.</p>
    </>
  );
}
