"use client";

import { Ban, Cable, Check, Info, MoreHorizontal, Pencil, Plus, RefreshCw, Search, ShieldOff, Smartphone, Wifi } from "lucide-react";
import { useMemo, useState } from "react";
import { AccessModeCard, useAccessLabels } from "@/components/access-mode";
import { PageHeader } from "@/components/app-shell";
import { DeviceIcon } from "@/components/device-icon";
import { Badge, Button, Card, ConfirmDialog, CopyButton, cn, Dialog, EmptyState, Field, Input, Notice, Segmented, Skeleton } from "@/components/ui";
import { displayName, guessKind, isRandomizedMac } from "@/lib/devices";
import { qk, useDevices, useNicknames, useRouterAction } from "@/lib/queries";
import type { Device } from "@/lib/router/types";
import { normalizeMac } from "@/lib/router/util";

type Filter = "all" | "online" | "blocked";

function DeviceRow({ d, onBlock, onUnblock, onRename, busy }: { d: Device; onBlock: () => void; onUnblock: () => void; onRename: () => void; busy: boolean }) {
  const names = useNicknames((s) => s.names);
  const labels = useAccessLabels();
  const [open, setOpen] = useState(false);
  const name = displayName(d, names[d.mac]);
  return (
    <li className={cn("rounded-xl transition", open && "bg-[var(--surface-2)]")}>
      <div className="flex items-center gap-3 px-2.5 py-3 sm:px-4">
        <DeviceIcon kind={guessKind(d, names[d.mac])} blocked={d.blocked} className="size-10 sm:size-11" />
        <button className="min-w-0 flex-1 text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <div className="flex items-center gap-2">
            <p className="truncate text-[14.5px] font-medium">{name}</p>
            {d.blocked && (
              <Badge tone="red" className="hidden shrink-0 sm:inline-flex">
                {labels.blockedBadge}
              </Badge>
            )}
          </div>
          <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[12.5px] text-muted">
            {d.blocked && <span className="shrink-0 font-medium text-rose-600 sm:hidden dark:text-rose-400">{labels.blockedBadge} ·</span>}
            {d.medium === "wifi" ? <Wifi className="size-3.5 shrink-0" /> : d.medium === "wired" ? <Cable className="size-3.5 shrink-0" /> : null}
            <span className="truncate">
              {d.online ? (
                <>
                  {d.medium === "wifi" ? `Wi-Fi${d.band ? ` ${d.band}` : ""}` : d.medium === "wired" ? "Cable" : "Connected"}
                  {d.ipv4 && <span className="font-mono"> · {d.ipv4}</span>}
                </>
              ) : (
                "Not connected"
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
            {d.hostname && (
              <div className="flex items-center justify-between gap-2 sm:block">
                <dt className="text-muted">Reported name</dt>
                <dd>{d.hostname}</dd>
              </div>
            )}
            {d.ipv6 && (
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
          <Button size="sm" variant="secondary" className="mt-3" onClick={onRename}>
            <Pencil className="size-3.5" /> Rename
          </Button>
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
  const [query, setQuery] = useState("");
  const [confirm, setConfirm] = useState<Device | null>(null);
  const [rename, setRename] = useState<Device | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [manual, setManual] = useState(false);
  const [manualMac, setManualMac] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const labels = useAccessLabels();

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
      .filter((d) => (filter === "online" ? d.online && !d.blocked : filter === "blocked" ? d.blocked : true))
      .filter((d) => !q || [displayName(d, names[d.mac]), d.hostname, d.ipv4, d.mac].some((s) => s?.toLowerCase().includes(q)))
      .sort((a, b) => Number(b.blocked) - Number(a.blocked) || Number(b.online) - Number(a.online) || displayName(a, names[a.mac]).localeCompare(displayName(b, names[b.mac])));
  }, [data, filter, query, names]);

  const counts = {
    all: data?.length ?? 0,
    online: data?.filter((d) => d.online && !d.blocked).length ?? 0,
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
            { value: "online", label: `Online ${counts.online || ""}` },
            { value: "blocked", label: `${labels.allow ? "Not allowed" : "Blocked"} ${counts.blocked || ""}` },
          ]}
        />
        <div className="relative sm:w-72">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, IP or MAC" className="h-10 pl-10 text-sm" />
        </div>
      </div>

      {error && (
        <Notice tone="red" className="mb-4">
          {(error as Error).message}
        </Notice>
      )}

      {data && <AccessModeCard devices={data} />}

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
        Blocked devices can still join your Wi-Fi but can&apos;t reach the internet. Changes take a few seconds while the router saves them.
      </p>

      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={() => confirm && setBlocked(confirm, true)}
        loading={!!confirm && pending === confirm.mac}
        tone="danger"
        title={`Block ${confirm ? displayName(confirm, names[confirm.mac]) : ""}?`}
        description="This device will lose internet access right away. You can unblock it any time from this page."
        confirmLabel="Block device"
      />

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
