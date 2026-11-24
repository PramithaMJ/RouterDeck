"use client";

import { Activity, ArrowRight, Ban, Clock, Cpu, Gauge, Globe, KeyRound, MemoryStick, Phone, QrCode, RotateCcw, Satellite, SignalHigh, Smartphone, Tv, Wifi, Zap } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { PageHeader } from "@/components/app-shell";
import { DeviceIcon } from "@/components/device-icon";
import { IspLogo } from "@/components/isp-badge";
import { ispById } from "@/lib/isp";
import { useSession } from "@/lib/session";
import { useThisDevice } from "@/lib/this-device";
import { Badge, Card, CardHeader, CopyButton, cn, Meter, Skeleton, StatusDot } from "@/components/ui";
import { WifiQrDialog } from "@/components/wifi-qr";
import { displayName, guessKind } from "@/lib/devices";
import { useDevices, useNicknames, useOverview, useWifi } from "@/lib/queries";
import type { WifiNetwork } from "@/lib/router/types";
import { fiberQuality } from "@/lib/signal";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

function InternetHero() {
  const { data, isLoading } = useOverview();
  const q = fiberQuality(data?.fiber?.rxPowerDbm);
  const isp = ispById(data?.identity.isp);
  if (isLoading || !data) return <Skeleton className="h-[172px] rounded-[18px]" />;
  const online = data.internet.online;
  const stats: { k: string; v: React.ReactNode }[] = [
    { k: "Internet IP", v: data.internet.publicIp ? <span className="flex items-center gap-1">{data.internet.publicIp}<CopyButton value={data.internet.publicIp} /></span> : "–" },
    { k: "Connection", v: data.cellular?.networkType ?? data.internet.protocol ?? "–" },
    q ? { k: "Fiber signal", v: <span><span className={q.tone === "green" ? "text-emerald-600 dark:text-emerald-400" : q.tone === "amber" ? "text-amber-600 dark:text-amber-400" : "text-rose-600"}>{q.label}</span> <span className="text-muted">{data.fiber!.rxPowerDbm!.toFixed(1)} dBm</span></span> } : data.cellular ? { k: "Signal", v: <span className="flex items-center gap-2"><Bars n={data.cellular.bars ?? 0} /> {data.cellular.operator}</span> } : { k: "Router", v: data.identity.model },
    { k: "Uptime", v: data.internet.uptime ?? data.uptime ?? "–" },
  ];
  return (
    <div className="surface overflow-hidden rounded-[18px] border border-subtle">
      <div className="flex flex-wrap items-center justify-between gap-4 p-6 sm:p-7">
        <div>
          <p className="label-caps">Internet</p>
          <p className="mt-2 flex items-center gap-3 text-[2.2rem] font-semibold leading-none tracking-[-0.035em]">
            <span className="relative inline-flex size-3">
              {online && <span className="absolute inset-0 animate-ping rounded-full bg-emerald-500/50" />}
              <span className={cn("relative size-3 rounded-full", online ? "bg-emerald-500" : "bg-rose-500")} />
            </span>
            {online ? "Online" : "Offline"}
          </p>
          <p className="mt-2 text-[14px] text-muted">{online ? "Everything looks normal." : "Your router can't reach your provider. Check the cable or contact your ISP."}</p>
        </div>
        {isp && (
          <div className="flex items-center gap-3 rounded-xl border border-subtle px-3.5 py-2.5">
            <IspLogo isp={isp} />
            <div>
              <p className="label-caps">Provider</p>
              <p className="text-[14px] font-medium">{isp.name}</p>
            </div>
          </div>
        )}
      </div>
      <dl className="grid grid-cols-2 border-t border-subtle sm:grid-cols-4">
        {stats.map((s, i) => (
          <div key={s.k} className={cn("px-6 py-4 sm:px-7", i % 2 === 1 && "border-l border-subtle", i >= 2 && "border-t border-subtle sm:border-t-0", i >= 1 && "sm:border-l")}>
            <dt className="label-caps">{s.k}</dt>
            <dd className="mt-1 font-mono text-[13.5px]">{s.v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function Bars({ n, light }: { n: number; light?: boolean }) {
  return (
    <span className="inline-flex items-end gap-[3px]" aria-label={`${n} of 5 bars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={cn("w-[4px] rounded-sm", i <= n ? (light ? "bg-white" : "bg-emerald-500") : light ? "bg-white/30" : "bg-[var(--surface-2)]")} style={{ height: 4 + i * 3 }} />
      ))}
    </span>
  );
}

function SignalCard() {
  const { data } = useOverview();
  const c = data?.cellular;
  const s = data?.satellite;
  if (!c && !s) return null;
  const quality = (rsrp?: number) => (rsrp === undefined ? undefined : rsrp >= -80 ? "Excellent" : rsrp >= -90 ? "Good" : rsrp >= -100 ? "Fair" : "Weak");
  const items: { k: string; v?: string | number; u?: string }[] = c
    ? [
        { k: "Network", v: c.networkType },
        { k: "Operator", v: c.operator },
        { k: "RSRP", v: c.rsrp, u: "dBm" },
        { k: "SINR", v: c.sinr, u: "dB" },
        { k: "RSRQ", v: c.rsrq, u: "dB" },
        { k: "Band", v: c.band },
      ]
    : [
        { k: "Latency", v: s!.latencyMs, u: "ms" },
        { k: "Download now", v: s!.downlinkMbps, u: "Mbps" },
        { k: "Upload now", v: s!.uplinkMbps, u: "Mbps" },
        { k: "Obstructed", v: s!.obstructedPercent, u: "%" },
        { k: "Drop rate", v: s!.dropRatePercent, u: "%" },
      ];
  return (
    <Card className="mt-6">
      <CardHeader
        icon={c ? <SignalHigh className="size-5 text-muted" /> : <Satellite className="size-5 text-muted" />}
        title={c ? "Mobile signal" : "Starlink dish"}
        description={c ? (quality(c.rsrp) ? `Signal is ${quality(c.rsrp)!.toLowerCase()}. Move the router near a window if it drops.` : undefined) : s?.currentlyObstructed ? "Something is blocking the dish's view of the sky right now." : "Dish has a clear connection."}
        action={c ? <Bars n={c.bars ?? 0} /> : undefined}
      />
      <div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-3 sm:p-6 lg:grid-cols-6">
        {items
          .filter((i) => i.v !== undefined && i.v !== "")
          .map((i) => (
            <div key={i.k} className="rounded-2xl bg-[var(--surface-2)] p-3.5">
              <p className="text-[12px] text-muted">{i.k}</p>
              <p className="mt-1 text-[15px] font-semibold tabular-nums">
                {i.v}
                {i.u && <span className="ml-1 text-[12px] font-normal text-muted">{i.u}</span>}
              </p>
            </div>
          ))}
      </div>
      {s?.alerts && s.alerts.length > 0 && <div className="px-6 pb-5 text-[13px] text-amber-700 dark:text-amber-300">Alerts: {s.alerts.join(", ")}</div>}
    </Card>
  );
}

function Tile({ icon, label, value, sub, href, children }: { icon: React.ReactNode; label: string; value: React.ReactNode; sub?: React.ReactNode; href?: string; children?: React.ReactNode }) {
  const body = (
    <Card className={cn("h-full p-4 sm:p-5", href && "transition hover:border-[var(--muted)]")}>
      <div className="label-caps flex items-center gap-2">
        {icon}
        {label}
      </div>
      <div className="mt-3 font-mono text-[1.7rem] font-medium leading-none tracking-[-0.02em]">{value}</div>
      {sub && <div className="mt-2 text-[12.5px] text-muted">{sub}</div>}
      {children}
    </Card>
  );
  return href ? (
    <Link href={href} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}

function QuickAction({ icon, label, onClick, href, tone = "brand" }: { icon: React.ReactNode; label: string; onClick?: () => void; href?: string; tone?: "brand" | "rose" | "amber" | "emerald" }) {
  const t = tone === "rose" ? "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-300" : "bg-[var(--surface-2)] text-[var(--text)]";
  const cls = "group flex items-center gap-3 rounded-xl border border-subtle surface px-3.5 py-3 text-left transition hover:border-[var(--muted)]";
  const inner = (
    <>
      <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", t)}>{icon}</span>
      <span className="flex-1 text-[14px] font-medium">{label}</span>
      <ArrowRight className="size-4 text-muted transition group-hover:translate-x-0.5" />
    </>
  );
  return href ? (
    <Link href={href} className={cls}>
      {inner}
    </Link>
  ) : (
    <button onClick={onClick} className={cls}>
      {inner}
    </button>
  );
}

export default function DashboardPage() {
  const overview = useOverview();
  const devices = useDevices();
  const wifi = useWifi();
  const names = useNicknames((s) => s.names);
  const caps = useSession((s) => s.driver?.capabilities);
  const host = useSession((s) => s.connection?.host) ?? "";
  const thisMac = useThisDevice((s) => s.byRouter[host]);
  const [share, setShare] = useState<WifiNetwork | null>(null);

  const ov = overview.data;
  const devs = devices.data ?? [];
  const online = devs.filter((d) => d.online && !d.blocked);
  const blocked = devs.filter((d) => d.blocked);
  const nets = wifi.data ?? [];
  const firstNet = nets.find((n) => n.enabled) ?? nets[0] ?? null;

  return (
    <>
      <PageHeader title={greeting()} description="Here's how your home network is doing." />

      <InternetHero />

      <div className="mt-4 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {caps?.devices && <Tile
          icon={<Smartphone className="size-4" />}
          label="Devices online"
          href="/devices/"
          value={devices.isLoading ? <Skeleton className="h-8 w-10" /> : online.length}
          sub={blocked.length ? <span className="text-rose-600 dark:text-rose-400">{blocked.length} blocked</span> : "None blocked"}
        />}
        {caps?.wifi && <Tile
          icon={<Wifi className="size-4" />}
          label="Wi-Fi"
          href="/wifi/"
          value={wifi.isLoading ? <Skeleton className="h-8 w-16" /> : `${nets.filter((n) => n.enabled).length} on`}
          sub={nets.map((n) => n.band).join(" + ") || "-"}
        />}
        {ov?.cpuPercent !== undefined && <Tile icon={<Activity className="size-4" />} label="Router load" value={`${ov.cpuPercent}%`} sub="CPU">
          {ov?.memoryPercent !== undefined && (
            <div className="mt-3 space-y-2">
              <div className="flex items-center gap-2 text-[11.5px] text-muted">
                <Cpu className="size-3.5" />
                <Meter value={ov.cpuPercent ?? 0} />
              </div>
              <div className="flex items-center gap-2 text-[11.5px] text-muted">
                <MemoryStick className="size-3.5" />
                <Meter value={ov.memoryPercent} />
              </div>
            </div>
          )}
        </Tile>}
        {!caps?.devices && <Tile icon={<Gauge className="size-4" />} label="Speed test" href="/speed-test/" value="Run" sub="Check your real speed" />}
        {!ov || ov.uptime ? (
          <Tile icon={<Clock className="size-4" />} label="Router uptime" value={ov?.uptime ?? <Skeleton className="h-8 w-20" />} sub={ov?.identity.firmware ? `Firmware ${ov.identity.firmware}` : undefined} />
        ) : ov.cellular?.rsrp !== undefined ? (
          // Routers that don't report their own uptime (many 4G boxes): show signal quality instead.
          <Tile
            icon={<SignalHigh className="size-4" />}
            label="Mobile signal"
            value={ov.cellular.rsrp >= -80 ? "Excellent" : ov.cellular.rsrp >= -90 ? "Good" : ov.cellular.rsrp >= -100 ? "Fair" : "Weak"}
            sub={`${ov.cellular.rsrp} dBm${ov.cellular.band ? ` · ${ov.cellular.band}` : ""}${ov.identity.firmware ? ` · Firmware ${ov.identity.firmware}` : ""}`}
          />
        ) : (
          <Tile icon={<Clock className="size-4" />} label="Router" value={ov.identity.model} sub={ov.identity.firmware ? `Firmware ${ov.identity.firmware}` : undefined} />
        )}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.15fr]">
        <section>
          <h2 className="label-caps mb-3">Quick actions</h2>
          <div className="grid gap-2.5">
            <QuickAction icon={<Gauge className="size-5" />} label="Run a speed test" href="/speed-test/" />
            {caps?.wifi && <QuickAction icon={<QrCode className="size-5" />} label="Share Wi-Fi with a QR code" onClick={() => firstNet && setShare(firstNet)} />}
            {caps?.blockDevices && <QuickAction icon={<Ban className="size-5" />} label="Block a device" href="/devices/" tone="rose" />}
            {caps?.wifi && <QuickAction icon={<KeyRound className="size-5" />} label="Change Wi-Fi password" href="/wifi/" tone="amber" />}
            {caps?.reboot && <QuickAction icon={<RotateCcw className="size-5" />} label="Restart router" href="/settings/#restart" tone="emerald" />}
          </div>
        </section>

        {caps?.devices && <Card>
          <CardHeader
            title="Who's connected"
            description={devices.isLoading ? "Looking…" : `${online.length} device${online.length === 1 ? "" : "s"} online right now`}
            action={
              <Link href="/devices/" className="text-[13px] font-medium text-brand-600 hover:underline dark:text-brand-300">
                See all
              </Link>
            }
          />
          <ul className="mt-3 divide-y divide-[var(--border)] px-2 pb-2">
            {devices.isLoading &&
              Array.from({ length: 4 }).map((_, i) => (
                <li key={i} className="flex items-center gap-3 px-3 py-3">
                  <Skeleton className="size-11 rounded-2xl" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3.5 w-1/2" />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                </li>
              ))}
            {devs.slice(0, 5).map((d) => (
              <li key={d.mac}>
                <Link href="/devices/" className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-[var(--surface-2)]">
                  <DeviceIcon kind={guessKind(d, names[d.mac])} blocked={d.blocked} />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 truncate text-[14px] font-medium">
                      <span className="truncate">{displayName(d, names[d.mac])}</span>
                      {d.mac === thisMac && <Badge tone="brand">This device</Badge>}
                    </p>
                    <p className="truncate text-[12.5px] text-muted">
                      {d.ipv4 ?? "-"} · {d.medium === "wifi" ? `Wi-Fi${d.band ? ` ${d.band}` : ""}` : d.medium === "wired" ? "Cable" : "Offline"}
                    </p>
                  </div>
                  {d.blocked ? <Badge tone="red">Blocked</Badge> : <StatusDot tone="green" />}
                </Link>
              </li>
            ))}
          </ul>
        </Card>}
      </div>

      <SignalCard />

      {ov && ov.wan.length > 1 && (
        <Card className="mt-6">
          <CardHeader title="Connections from your provider" description="Services your ISP delivers over this line." />
          <div className="grid gap-3 p-5 sm:grid-cols-3 sm:p-6">
            {ov.wan.map((w) => {
              const Icon = w.kind === "internet" ? Globe : w.kind === "voice" ? Phone : w.kind === "iptv" ? Tv : Zap;
              const label = w.kind === "internet" ? "Internet" : w.kind === "voice" ? "Telephone" : w.kind === "iptv" ? "PEO TV / IPTV" : "Other service";
              return (
                <div key={w.name} className="rounded-2xl bg-[var(--surface-2)] p-4">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-[14px] font-medium">
                      <Icon className="size-4 text-muted" /> {label}
                    </span>
                    <Badge tone={w.up ? "green" : "red"}>{w.up ? "Up" : "Down"}</Badge>
                  </div>
                  <p className="mt-2 font-mono text-[12px] text-muted">
                    {w.protocol}
                    {w.vlan ? ` · VLAN ${w.vlan}` : ""}
                    {w.ipv4 ? ` · ${w.ipv4}` : ""}
                  </p>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <WifiQrDialog network={share} open={!!share} onClose={() => setShare(null)} />
    </>
  );
}
