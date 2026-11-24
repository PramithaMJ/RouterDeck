"use client";

import { Ban, Cable, Check, Info, MoreHorizontal, Pencil, Plus, RefreshCw, Search, ShieldOff, Smartphone, Wifi, WifiHigh, WifiLow, WifiZero } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { suggestThisDevice, useThisDevice } from "@/lib/this-device";
import { useSession } from "@/lib/session";
import { AccessModeCard, useAccessLabels } from "@/components/access-mode";
import { PageHeader } from "@/components/app-shell";
import { Ipv6Notice } from "@/components/ipv6-notice";
import { DeviceIcon } from "@/components/device-icon";
import { Badge, Button, Card, ConfirmDialog, CopyButton, cn, Dialog, EmptyState, Field, Input, Notice, Segmented, Skeleton } from "@/components/ui";
import { bandLabel, displayName, guessKind, isRandomizedMac, SIGNAL_LABEL, signalQuality, type SignalQuality } from "@/lib/devices";
import { useAdvanced } from "@/lib/preferences";
import { qk, useDevices, useLocalIp, useNicknames, useRouterAction } from "@/lib/queries";
import type { Band, Device } from "@/lib/router/types";
import { normalizeMac } from "@/lib/router/util";

type Filter = "all" | "online" | "blocked";
type BandFilter = "any" | Band | "wired";

const SIGNAL_ICON: Record<SignalQuality, typeof Wifi> = { excellent: Wifi, good: WifiHigh, fair: WifiLow, weak: WifiZero };
const SIGNAL_TONE: Record<SignalQuality, string> = { excellent: "", good: "", fair: "text-amber-600 dark:text-amber-400", weak: "text-rose-600 dark:text-rose-400" };

function BandChip({ band }: { band: Band }) {
  return <span className="shrink-0 rounded-md border border-subtle px-1.5 py-px font-mono text-[11px] font-medium leading-4 text-[var(--text)]">{bandLabel(band)}</span>;
}

function DeviceRow({
  d,
  onBlock,
  onUnblock,
  onRename,
  busy,
  isMe,
  onToggleMe,
}: {
  d: Device;
  onBlock: () => void;
  onUnblock: () => void;
  onRename: () => void;
  busy: boolean;
  isMe: boolean;
  onToggleMe: () => void;
}) {
  const names = useNicknames((s) => s.names);
  const labels = useAccessLabels();
  const [open, setOpen] = useState(false);
  const name = displayName(d, names[d.mac]);
  const q = d.online ? signalQuality(d.signal) : undefined;
  const advanced = useAdvanced();
  const SignalIcon = q ? SIGNAL_ICON[q] : Wifi;
  return (
    <li className={cn("rounded-xl transition", open && "bg-[var(--surface-2)]")}>
      <div className="flex items-center gap-3 px-2.5 py-3 sm:px-4">
        <DeviceIcon kind={guessKind(d, names[d.mac])} blocked={d.blocked} className="size-10 sm:size-11" />
        <button className="min-w-0 flex-1 text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <div className="flex items-center gap-2">
            {d.online && !d.blocked && <span className="size-2 shrink-0 rounded-full bg-emerald-500" title="Connected now" aria-label="Connected now" />}
            <p className="truncate text-[14.5px] font-medium">{name}</p>
            {isMe && (
              <Badge tone="brand" className="shrink-0">
                This device
              </Badge>
            )}
            {d.blocked && (
              <Badge tone="red" className="hidden shrink-0 sm:inline-flex">
                {labels.blockedBadge}
              </Badge>
            )}
          </div>
          <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[12.5px] text-muted">
            {d.blocked && <span className="shrink-0 font-medium text-rose-600 sm:hidden dark:text-rose-400">{labels.blockedBadge} ·</span>}
            {d.medium === "wifi" ? <SignalIcon className={cn("size-3.5 shrink-0", q && SIGNAL_TONE[q])} aria-label={q ? SIGNAL_LABEL[q] : "Wi-Fi"} /> : d.medium === "wired" ? <Cable className="size-3.5 shrink-0" /> : null}
            {d.online && d.medium === "wifi" && d.band && <BandChip band={d.band} />}
            <span className="truncate">
              {d.online ? (
                <>
                  {[d.medium === "wifi" ? (d.band ? null : "Wi-Fi") : d.medium === "wired" ? "Cable" : d.ipv4 ? null : "Connected", d.ipv4]
                    .filter(Boolean)
                    .map((t, i) => (
                      <span key={i}>
                        {i > 0 && " · "}
                        <span className={cn(t === d.ipv4 && "font-mono")}>{t}</span>
                      </span>
                    ))}
                  {d.medium === "wifi" && q && <span className={cn("hidden sm:inline", SIGNAL_TONE[q])}> · {SIGNAL_LABEL[q]}</span>}
                  {advanced && d.medium === "wifi" && d.linkMbps ? <span className="hidden sm:inline"> · {Math.round(d.linkMbps)} Mbps</span> : null}
                </>
              ) : (
                "Not connected now"
              )}
            </span>
          </p>
        </button>
        {d.blocked ? (
          <Button size="sm" variant="success" onClick={onUnblock} loading={busy} className="shrink-0 px-2.5 sm:px-3">
            {!busy && <Check className="size-4" />} {labels.unblockLabel}
          </Button>
        ) : (
          <Button size="sm" variant="soft-danger" onClick={onBlock} loading={busy} className="shrink-0 px-2.5 sm:px-3">
            {!busy && <Ban className="size-4" />} {labels.blockLabel}
          </Button>
        )}
        <button onClick={() => setOpen((o) => !o)} className="hidden rounded-lg p-1.5 text-muted hover:bg-[var(--surface-2)] sm:block" aria-label="Details">
          <MoreHorizontal className="size-5" />
        </button>
      </div>
      {open && (
        <div className="animate-fade-in px-4 pb-4 sm:pl-[4.25rem]">
          <dl className="grid gap-x-6 gap-y-2 text-[13px] sm:grid-cols-2">
            <div className="flex items-center justify-between gap-2 sm:block">
              <dt className="text-muted">Device address (MAC)</dt>
              <dd className="flex items-center gap-1 font-mono">
                {d.mac.toUpperCase()} <CopyButton value={d.mac.toUpperCase()} />
              </dd>
            </div>
            {d.ipv4 && (
              <div className="flex items-center justify-between gap-2 sm:block">
                <dt className="text-muted">IP address</dt>
                <dd className="flex items-center gap-1 font-mono">
                  {d.ipv4} <CopyButton value={d.ipv4} />
                </dd>
              </div>
            )}
            {d.online && d.medium === "wifi" && d.band && (
              <div className="flex items-center justify-between gap-2 sm:block">
                <dt className="text-muted">Connected to</dt>
                <dd>Wi-Fi {bandLabel(d.band)}</dd>
              </div>
            )}
            {d.online && d.signal !== undefined && (
              <div className="flex items-center justify-between gap-2 sm:block">
                <dt className="text-muted">Signal</dt>
                <dd>
                  {q ? SIGNAL_LABEL[q].replace(" signal", "") : "—"} {advanced && <span className="font-mono text-muted">({d.signal} dBm)</span>}
                </dd>
              </div>
            )}
            {advanced && d.online && d.linkMbps !== undefined && (
              <div className="flex items-center justify-between gap-2 sm:block">
                <dt className="text-muted">Link speed</dt>
                <dd className="font-mono">{d.linkMbps} Mbps</dd>
              </div>
            )}
            {d.hostname && (
              <div className="flex items-center justify-between gap-2 sm:block">
                <dt className="text-muted">Reported name</dt>
                <dd>{d.hostname}</dd>
              </div>
            )}
            {advanced && d.ipv6 && (
              <div className="flex items-center justify-between gap-2 sm:block">
                <dt className="text-muted">IPv6</dt>
                <dd className="truncate font-mono text-[12px]">{d.ipv6}</dd>
              </div>
            )}
          </dl>
          {isRandomizedMac(d.mac) && (
            <p className="mt-3 flex items-start gap-1.5 text-[12.5px] text-muted">
              <Info className="mt-0.5 size-3.5 shrink-0" /> This device uses a private (randomized) Wi-Fi address. If it changes its address, the block may stop applying.
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={onRename}>
              <Pencil className="size-3.5" /> Rename
            </Button>
            <Button size="sm" variant="ghost" onClick={onToggleMe}>
              <Smartphone className="size-3.5" /> {isMe ? "Not the device I'm using" : "This is the device I'm using"}
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

export default function DevicesPage() {
  const { data, isLoading, isFetching, refetch, error } = useDevices();
  const names = useNicknames((s) => s.names);
  const setName = useNicknames((s) => s.setName);
  const [filter, setFilter] = useState<Filter>("all");
  const [bandFilter, setBandFilter] = useState<BandFilter>("any");
  const [query, setQuery] = useState("");
  const [confirm, setConfirm] = useState<Device | null>(null);
  const [rename, setRename] = useState<Device | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [manual, setManual] = useState(false);
  const [manualMac, setManualMac] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const labels = useAccessLabels();
  const blockScope = useSession((st) => st.driver?.capabilities.blockScope);
  const host = useSession((st) => st.connection?.host) ?? "";
  const thisMac = useThisDevice((st) => st.byRouter[host]);
  const setThis = useThisDevice((st) => st.set);
  const { data: localIp } = useLocalIp();
  const [picking, setPicking] = useState(false);

  // Exact detection when the connector knows this computer's IP.
  useEffect(() => {
    if (thisMac || !localIp || !data) return;
    const me = data.find((d) => d.ipv4 === localIp);
    if (me) setThis(host, me.mac);
  }, [thisMac, localIp, data, host, setThis]);
  const suggestion = !thisMac && data ? suggestThisDevice(data) : undefined;
  const isMe = (d: Device) => d.mac === thisMac;

  const block = useRouterAction<{ mac: string; blocked: boolean; name: string }>((drv, v) => drv.setDeviceBlocked(v.mac, v.blocked), {
    invalidate: [qk.devices, qk.overview, qk.access],
    pending: (v) => (v.blocked ? `Cutting internet for ${v.name}…` : `Giving ${v.name} internet access…`),
    success: (v) => (v.blocked ? `${v.name} can no longer use the internet.` : `${v.name} can use the internet.`),
  });

  async function setBlocked(d: Device, blocked: boolean) {
    setPending(d.mac);
    try {
      await block.mutateAsync({ mac: d.mac, blocked, name: displayName(d, names[d.mac]) });
    } catch {
    } finally {
      setPending(null);
      setConfirm(null);
    }
  }

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data ?? [])
      .filter((d) => (filter === "online" ? d.online : filter === "blocked" ? d.blocked : true))
      .filter((d) => bandFilter === "any" || (bandFilter === "wired" ? d.online && d.medium === "wired" : d.online && d.band === bandFilter))
      .filter((d) => !q || [displayName(d, names[d.mac]), d.hostname, d.ipv4, d.mac].some((s) => s?.toLowerCase().includes(q)))
      .sort((a, b) => Number(b.blocked) - Number(a.blocked) || Number(b.online) - Number(a.online) || displayName(a, names[a.mac]).localeCompare(displayName(b, names[b.mac])));
  }, [data, filter, bandFilter, query, names]);

  // "Connected now" breakdown per Wi-Fi band (and cable), shown when there's more than one.
  const live = (data ?? []).filter((d) => d.online);
  const groups = (
    [
      ["2.4GHz", live.filter((d) => d.band === "2.4GHz").length],
      ["5GHz", live.filter((d) => d.band === "5GHz").length],
      ["6GHz", live.filter((d) => d.band === "6GHz").length],
      ["wired", live.filter((d) => d.medium === "wired").length],
    ] as [BandFilter, number][]
  ).filter(([, n]) => n > 0);

  const counts = {
    all: data?.length ?? 0,
    online: data?.filter((d) => d.online).length ?? 0,
    blocked: data?.filter((d) => d.blocked).length ?? 0,
  };

  return (
    <>
      <PageHeader
        title="Devices"
        description="Everything connected to your network. Block a device to cut its internet instantly."
        action={
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => setManual(true)}>
              <Plus className="size-4" /> Block by address
            </Button>
            <Button variant="secondary" size="icon" className="size-8" onClick={() => refetch()} aria-label="Refresh">
              <RefreshCw className={cn("size-4", isFetching && "animate-spin")} />
            </Button>
          </div>
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: `All ${counts.all || ""}` },
            { value: "online", label: `Connected ${counts.online || ""}` },
            { value: "blocked", label: `${labels.allow ? "Not allowed" : "Blocked"} ${counts.blocked || ""}` },
          ]}
        />
        <div className="relative sm:w-72">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, IP or MAC" className="h-10 pl-10 text-sm" />
        </div>
      </div>

      {groups.length > 1 && (
        <div className="mb-4 flex flex-wrap items-center gap-1.5 text-[13px]" role="group" aria-label="Filter by connection">
          <span className="mr-1 flex items-center gap-1.5 text-muted">
            <span className="size-2 rounded-full bg-emerald-500" /> {live.length} connected now
          </span>
          {groups.map(([k, n]) => (
            <button
              key={k}
              onClick={() => setBandFilter((cur) => (cur === k ? "any" : k))}
              aria-pressed={bandFilter === k}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 font-medium transition",
                bandFilter === k ? "border-[var(--text)] bg-[var(--surface)]" : "border-subtle text-muted hover:text-[var(--text)]",
              )}
            >
              {k === "wired" ? <Cable className="size-3.5" /> : <Wifi className="size-3.5" />}
              {k === "wired" ? "Cable" : bandLabel(k)}
              <span className="font-mono text-[12px] text-muted">{n}</span>
            </button>
          ))}
          {bandFilter !== "any" && (
            <button onClick={() => setBandFilter("any")} className="ml-1 text-[12.5px] text-muted underline underline-offset-2 hover:text-[var(--text)]">
              Show all
            </button>
          )}
        </div>
      )}

      {error && (
        <Notice tone="red" className="mb-4">
          {(error as Error).message}
        </Notice>
      )}

      {data && !thisMac && data.some((d) => d.online) && (
        <Card className="mb-4 flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <p className="text-[14.5px] font-semibold">Which one is the device you&apos;re using?</p>
            <p className="mt-0.5 text-[13px] text-muted">
              {suggestion ? (
                <>
                  Looks like <b>{displayName(suggestion, names[suggestion.mac])}</b>. Confirm it so RouterDeck can warn you before you block yourself.
                </>
              ) : (
                <>Mark it once so RouterDeck can warn you before you block yourself.</>
              )}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            {suggestion && (
              <Button size="sm" onClick={() => setThis(host, suggestion.mac)}>
                Yes, that&apos;s me
              </Button>
            )}
            <Button size="sm" variant="secondary" onClick={() => setPicking(true)}>
              {suggestion ? "Choose another" : "Choose"}
            </Button>
          </div>
        </Card>
      )}

      <Ipv6Notice what="devices" />
      {data && <AccessModeCard devices={data} me={thisMac} />}

      <Card className="p-1.5 sm:p-2">
        {isLoading ? (
          <ul>
            {Array.from({ length: 5 }).map((_, i) => (
              <li key={i} className="flex items-center gap-3 px-4 py-3.5">
                <Skeleton className="size-11 rounded-2xl" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3.5 w-2/5" />
                  <Skeleton className="h-3 w-1/4" />
                </div>
                <Skeleton className="h-8 w-20" />
              </li>
            ))}
          </ul>
        ) : list.length === 0 ? (
          <EmptyState
            icon={filter === "blocked" ? <ShieldOff className="size-5" /> : <Smartphone className="size-5" />}
            title={filter === "blocked" ? "No blocked devices" : query ? "No matches" : "No devices found"}
            description={filter === "blocked" ? "Devices you block will show up here so you can unblock them later." : undefined}
          />
        ) : (
          <ul className="space-y-0.5">
            {list.map((d) => (
              <DeviceRow
                key={d.mac}
                d={d}
                busy={pending === d.mac}
                onBlock={() => setConfirm(d)}
                onUnblock={() => setBlocked(d, false)}
                isMe={isMe(d)}
                onToggleMe={() => setThis(host, isMe(d) ? null : d.mac)}
                onRename={() => {
                  setRename(d);
                  setRenameValue(names[d.mac] ?? d.hostname ?? "");
                }}
              />
            ))}
          </ul>
        )}
      </Card>

      <p className="mt-4 flex items-start gap-2 px-1 text-[12.5px] text-muted">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        {blockScope === "wifi"
          ? "On this router, a blocked device can't join the Wi-Fi at all (it holds up to 10 devices, and devices on a cable can't be blocked). Changes restart the Wi-Fi for a few seconds."
          : "Blocked devices can still join your Wi-Fi but can't reach the internet. Changes take a few seconds while the router saves them."}
      </p>

      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={() => confirm && setBlocked(confirm, true)}
        loading={!!confirm && pending === confirm.mac}
        tone="danger"
        title={confirm && isMe(confirm) ? "Block the device you're using?" : `${labels.allow ? "Remove access for" : "Block"} ${confirm ? displayName(confirm, names[confirm.mac]) : ""}?`}
        description={
          confirm && isMe(confirm)
            ? "This is the device you're using right now. It will lose internet immediately. Keep this page open, because RouterDeck still reaches your router at home, so you can undo it here. If you close it, you'll need another device to unblock this one."
            : "This device will lose internet access right away. You can undo it any time from this page."
        }
        confirmLabel={confirm && isMe(confirm) ? "Yes, block my device" : labels.allow ? "Remove access" : "Block device"}
      />

      <Dialog open={picking} onClose={() => setPicking(false)} size="sm" title="Which device are you using?" description="Saved in this browser only.">
        <ul className="max-h-[50vh] space-y-1 overflow-y-auto">
          {(data ?? [])
            .filter((d) => d.online)
            .map((d) => (
              <li key={d.mac}>
                <button
                  onClick={() => {
                    setThis(host, d.mac);
                    setPicking(false);
                  }}
                  className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition hover:bg-[var(--surface-2)]"
                >
                  <DeviceIcon kind={guessKind(d, names[d.mac])} className="size-9 rounded-lg" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-medium">{displayName(d, names[d.mac])}</span>
                    <span className="block font-mono text-[11.5px] text-muted">{d.ipv4 ?? d.mac.toUpperCase()}</span>
                  </span>
                  {suggestion?.mac === d.mac && <Badge tone="brand">Likely</Badge>}
                </button>
              </li>
            ))}
        </ul>
      </Dialog>

      <Dialog
        open={!!rename}
        onClose={() => setRename(null)}
        size="sm"
        title="Rename device"
        description="Names are saved in this browser only."
        footer={
          <>
            <Button variant="secondary" onClick={() => setRename(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (rename) setName(rename.mac, renameValue);
                setRename(null);
              }}
            >
              Save
            </Button>
          </>
        }
      >
        <Input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} placeholder="e.g. Kamal's phone" autoFocus maxLength={40} />
      </Dialog>

      <Dialog
        open={manual}
        onClose={() => setManual(false)}
        size="sm"
        title="Block by device address"
        description="Block a device that isn't connected right now. Find its MAC address in the device's Wi-Fi settings."
        footer={
          <>
            <Button variant="secondary" onClick={() => setManual(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={!normalizeMac(manualMac)}
              loading={block.isPending}
              onClick={async () => {
                const mac = normalizeMac(manualMac)!;
                try {
                  await block.mutateAsync({ mac, blocked: true, name: mac.toUpperCase() });
                  setManual(false);
                  setManualMac("");
                } catch {}
              }}
            >
              Block
            </Button>
          </>
        }
      >
        <Field label="MAC address" htmlFor="mmac" error={manualMac && !normalizeMac(manualMac) ? "Should look like AA:BB:CC:DD:EE:FF" : undefined}>
          <Input id="mmac" value={manualMac} onChange={(e) => setManualMac(e.target.value)} placeholder="AA:BB:CC:DD:EE:FF" className="font-mono" autoComplete="off" spellCheck={false} />
        </Field>
      </Dialog>
    </>
  );
}
