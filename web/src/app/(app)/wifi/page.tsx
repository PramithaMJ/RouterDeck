"use client";

import { AlertTriangle, QrCode, RefreshCw, Shield, Sparkles, Wifi, WifiOff } from "lucide-react";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/app-shell";
import { Badge, Button, Card, ConfirmDialog, cn, Field, Input, Notice, PasswordInput, Skeleton, Switch } from "@/components/ui";
import { WifiQrDialog } from "@/components/wifi-qr";
import { GuestPassCard } from "@/components/guest-pass";
import { generateWifiPassword, passwordStrength } from "@/lib/password";
import { qk, useRouterAction, useWifi } from "@/lib/queries";
import type { WifiNetwork, WifiPatch } from "@/lib/router/types";

function StrengthBar({ pw }: { pw: string }) {
  const { score, label } = passwordStrength(pw);
  if (!pw) return null;
  const color = ["bg-rose-500", "bg-rose-500", "bg-amber-500", "bg-emerald-500", "bg-emerald-500"][score];
  return (
    <div className="flex items-center gap-2">
      <div className="flex flex-1 gap-1">
        {[1, 2, 3, 4].map((i) => (
          <span key={i} className={cn("h-1 flex-1 rounded-full transition-colors", i <= score ? color : "bg-[var(--surface-2)]")} />
        ))}
      </div>
      <span className="w-20 text-right text-[12px] text-muted">{label}</span>
    </div>
  );
}

function NetworkCard({ n, others, onShare }: { n: WifiNetwork; others: WifiNetwork[]; onShare: () => void }) {
  const [ssid, setSsid] = useState(n.ssid);
  const [pw, setPw] = useState(n.password ?? "");
  const [both, setBoth] = useState(false);
  const [confirmOff, setConfirmOff] = useState(false);
  useEffect(() => {
    setSsid(n.ssid);
    setPw(n.password ?? "");
  }, [n.ssid, n.password]);

  const save = useRouterAction<{ targets: { id: string; patch: WifiPatch }[] }>(
    async (drv, v) => {
      for (const t of v.targets) await drv.updateWifi(t.id, t.patch);
    },
    { invalidate: [qk.wifi, qk.overview], pending: "Saving Wi-Fi settings. Devices may disconnect briefly…", success: "Wi-Fi updated. Reconnect your devices with the new details." },
  );
  const toggle = useRouterAction<boolean>((drv, enabled) => drv.updateWifi(n.id, { enabled }), {
    invalidate: [qk.wifi, qk.overview],
    pending: (on) => `${on ? "Turning on" : "Turning off"} ${n.band} Wi-Fi…`,
    success: (on) => `${n.band} Wi-Fi is ${on ? "on" : "off"}.`,
  });

  const ssidErr = !ssid.trim() ? "Name can't be empty" : new TextEncoder().encode(ssid).length > 32 ? "Max 32 characters" : null;
  const pwErr = pw && (pw.length < 8 || pw.length > 63) ? "Use 8 to 63 characters" : null;
  const dirty = ssid !== n.ssid || pw !== (n.password ?? "");
  const pwChanged = pw !== (n.password ?? "") && !!pw;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (ssidErr || pwErr || !dirty) return;
    const patch: WifiPatch = {};
    if (ssid !== n.ssid) patch.ssid = ssid;
    if (pwChanged) patch.password = pw;
    const targets = [{ id: n.id, patch }];
    if (both && pwChanged) for (const o of others) targets.push({ id: o.id, patch: { password: pw } });
    save.mutate({ targets });
  }

  return (
    <Card className={cn("overflow-hidden", !n.enabled && "opacity-95")}>
      <div className="flex items-center gap-3 border-b border-subtle px-5 py-4 sm:px-6">
        <div className={cn("flex size-11 items-center justify-center rounded-2xl", n.enabled ? "bg-[var(--surface-2)] text-[var(--text)]" : "bg-[var(--surface-2)] text-muted")}>
          {n.enabled ? <Wifi className="size-5" /> : <WifiOff className="size-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-[15px] font-semibold">{n.band} network</h2>
            <Badge tone={n.enabled ? "green" : "neutral"}>{n.enabled ? "On" : "Off"}</Badge>
          </div>
          <p className="mt-0.5 text-[12.5px] text-muted">{n.band === "5GHz" ? "Faster, shorter range" : n.band === "2.4GHz" ? "Longer range, works with older devices" : "Newest devices"}</p>
        </div>
        <Switch
          size="lg"
          checked={n.enabled}
          disabled={toggle.isPending}
          label={`${n.band} Wi-Fi`}
          onChange={(v) => (v ? toggle.mutate(true) : setConfirmOff(true))}
        />
      </div>

      <form onSubmit={submit} className="space-y-4 p-5 sm:p-6">
        <Field label="Network name" htmlFor={`ssid-${n.id}`} error={ssidErr}>
          <Input id={`ssid-${n.id}`} value={ssid} onChange={(e) => setSsid(e.target.value)} maxLength={32} autoComplete="off" spellCheck={false} />
        </Field>
        <Field label="Password" htmlFor={`pw-${n.id}`} error={pwErr}>
          <div className="flex gap-2">
            <div className="flex-1">
              <PasswordInput id={`pw-${n.id}`} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" spellCheck={false} placeholder="No password (open network)" />
            </div>
            <Button type="button" variant="secondary" size="lg" className="h-11 shrink-0 px-3.5" onClick={() => setPw(generateWifiPassword())} title="Generate a strong password">
              <Sparkles className="size-[18px]" />
              <span className="hidden sm:inline">Generate</span>
            </Button>
          </div>
        </Field>
        <StrengthBar pw={pw} />

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-muted">
          <span className="flex items-center gap-1.5">
            <Shield className="size-3.5" /> {n.security}
          </span>
          {n.channel && <span>Channel {n.channel}</span>}
        </div>

        {pwChanged && others.length > 0 && (
          <label className="flex cursor-pointer items-center gap-2.5 text-[13.5px]">
            <input type="checkbox" checked={both} onChange={(e) => setBoth(e.target.checked)} className="size-4 rounded accent-[var(--color-brand-600)]" />
            Use this password for the {others.map((o) => o.band).join(" & ")} network too
          </label>
        )}

        {dirty && (
          <Notice tone="amber" icon={<AlertTriangle />}>
            Devices on this network will disconnect and must reconnect with the new {ssid !== n.ssid && pwChanged ? "name and password" : pwChanged ? "password" : "name"}. If you&apos;re connected over this Wi-Fi, this page will lose the router for a moment.
          </Notice>
        )}

        <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:items-center sm:justify-between">
          <Button type="button" variant="ghost" onClick={onShare} disabled={!n.enabled}>
            <QrCode className="size-4" /> Share
          </Button>
          <div className="flex gap-2">
            {dirty && (
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setSsid(n.ssid);
                  setPw(n.password ?? "");
                }}
              >
                Reset
              </Button>
            )}
            <Button type="submit" disabled={!dirty || !!ssidErr || !!pwErr} loading={save.isPending} className="flex-1 sm:flex-none">
              Save changes
            </Button>
          </div>
        </div>
      </form>

      <ConfirmDialog
        open={confirmOff}
        onClose={() => setConfirmOff(false)}
        onConfirm={() => {
          setConfirmOff(false);
          toggle.mutate(false);
        }}
        tone="danger"
        title={`Turn off ${n.band} Wi-Fi?`}
        description={`Everything connected to "${n.ssid}" will disconnect. If this computer uses that network, you'll need a cable or the other band to turn it back on.`}
        confirmLabel="Turn off"
      />
    </Card>
  );
}

/**
 * When 2.4 and 5 GHz share one name, phones show a single network and pick the
 * band themselves ("band steering"). Explain it, and offer separate names for
 * people who want to choose the band.
 */
function SameNameNotice({ data }: { data: WifiNetwork[] }) {
  const n24 = data.find((n) => n.band === "2.4GHz" && n.enabled);
  const n5 = data.find((n) => n.band === "5GHz" && n.enabled);
  const [ask, setAsk] = useState(false);
  const target = n24 && n5 ? `${n5.ssid.slice(0, 29)}-5G` : "";
  const split = useRouterAction<void>((drv) => drv.updateWifi(n5!.id, { ssid: target }), {
    invalidate: [qk.wifi],
    pending: "Renaming the 5 GHz network…",
    success: `Done. You'll now see "${n24?.ssid}" and "${target}".`,
  });
  if (!n24 || !n5 || n24.ssid !== n5.ssid || !n5.editable.ssid) return null;
  return (
    <Notice tone="brand" icon={<Wifi />} className="mb-5">
      Both bands use the name <b>{n24.ssid}</b>, so phones and laptops show <b>one</b> network and switch between 2.4 GHz and 5 GHz by themselves. That&apos;s usually best.
      <span className="mt-1 block">Want to choose the band yourself? Give 5 GHz its own name and you&apos;ll see two networks.</span>
      <div className="mt-2.5">
        <Button size="sm" variant="secondary" onClick={() => setAsk(true)} loading={split.isPending}>
          Use separate names
        </Button>
      </div>
      <ConfirmDialog
        open={ask}
        onClose={() => setAsk(false)}
        onConfirm={async () => {
          setAsk(false);
          await split.mutateAsync().catch(() => undefined);
        }}
        title={`Rename 5 GHz to "${target}"?`}
        description={`Your 2.4 GHz network stays "${n24.ssid}". Devices on 5 GHz drop for a moment and move to 2.4 GHz until you join "${target}" (same password). You can rename it back any time.`}
        confirmLabel="Rename 5 GHz"
      />
    </Notice>
  );
}

export default function WifiPage() {
  const { data, isLoading, refetch, isFetching, error } = useWifi();
  const [share, setShare] = useState<WifiNetwork | null>(null);
  return (
    <>
      <PageHeader
        title="Wi-Fi"
        description="Rename your networks, change passwords and share access with guests."
        action={
          <Button variant="secondary" size="icon" className="size-8" onClick={() => refetch()} aria-label="Refresh">
            <RefreshCw className={cn("size-4", isFetching && "animate-spin")} />
          </Button>
        }
      />
      {error && (
        <Notice tone="red" className="mb-4">
          {(error as Error).message}
        </Notice>
      )}
      <GuestPassCard mainSsid={data?.find((n) => n.band === "2.4GHz")?.ssid ?? data?.[0]?.ssid} />
      {data && <SameNameNotice data={data} />}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {isLoading &&
          [0, 1].map((i) => (
            <Card key={i} className="space-y-4 p-6">
              <div className="flex items-center gap-3">
                <Skeleton className="size-11 rounded-2xl" />
                <Skeleton className="h-4 w-40" />
              </div>
              <Skeleton className="h-11 w-full" />
              <Skeleton className="h-11 w-full" />
              <Skeleton className="h-10 w-32" />
            </Card>
          ))}
        {data?.map((n) => <NetworkCard key={n.id} n={n} others={data.filter((o) => o.id !== n.id)} onShare={() => setShare(n)} />)}
      </div>
      <WifiQrDialog network={share} open={!!share} onClose={() => setShare(null)} />
    </>
  );
}
