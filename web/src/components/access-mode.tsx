"use client";

import { AlertTriangle, ListChecks, ShieldBan, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { displayName, guessKind } from "@/lib/devices";
import { qk, useAccessControl, useLocalIp, useNicknames, useRouterAction } from "@/lib/queries";
import type { AccessMode, Device } from "@/lib/router/types";
import { DeviceIcon } from "./device-icon";
import { Badge, Button, Card, cn, Dialog, Notice, Skeleton } from "./ui";

export function AccessModeCard({ devices, me: knownMe }: { devices: Device[]; me?: string }) {
  const { data, isLoading } = useAccessControl();
  const names = useNicknames((s) => s.names);
  const { data: localIp } = useLocalIp();
  const [open, setOpen] = useState<AccessMode | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const me = useMemo(() => knownMe ?? devices.find((d) => localIp && d.ipv4 === localIp)?.mac, [devices, localIp, knownMe]);

  const apply = useRouterAction<{ mode: AccessMode; macs: string[] }>((d, v) => d.setAccessControl!(v.mode, v.macs), {
    invalidate: [qk.access, qk.devices, qk.overview],
    pending: (v) => (v.mode === "allowlist" ? "Turning on allow list…" : "Switching to block list…"),
    success: (v) => (v.mode === "allowlist" ? `Only ${v.macs.length} approved device${v.macs.length === 1 ? "" : "s"} can use the internet now.` : "Everyone can use the internet again."),
  });

  useEffect(() => {
    if (open !== "allowlist") return;
    const start = new Set(data?.mode === "allowlist" ? data.macs : devices.filter((d) => d.online).map((d) => d.mac));
    if (me) start.add(me);
    setPicked(start);
  }, [open, data, devices, me]);

  if (isLoading) return <Skeleton className="mb-4 h-[86px] rounded-2xl" />;
  if (!data || !data.supported.includes("allowlist")) return null;
  const allow = data.mode === "allowlist";

  return (
    <>
      <Card className="mb-4 flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-5">
        <div className={cn("flex size-11 shrink-0 items-center justify-center rounded-2xl", allow ? "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300" : "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300")}>
          {allow ? <ListChecks className="size-5" /> : <ShieldBan className="size-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-[15px] font-semibold">{allow ? "Allow list is on" : "Block list"}</p>
            <Badge tone={allow ? "amber" : "green"}>{allow ? `${data.macs.length} allowed` : `${data.macs.length} blocked`}</Badge>
          </div>
          <p className="mt-0.5 text-[13px] text-muted">
            {allow ? "Only the devices you approved can use the internet. New devices are blocked automatically." : "Every device can use the internet unless you block it."}
          </p>
        </div>
        <div className="flex shrink-0 rounded-xl bg-[var(--surface-2)] p-1">
          <button onClick={() => allow && setOpen("blocklist")} className={cn("rounded-lg px-3 py-1.5 text-[13px] font-medium transition", !allow ? "surface shadow-card" : "text-muted hover:text-[var(--text)]")}>
            Block list
          </button>
          <button onClick={() => setOpen("allowlist")} className={cn("rounded-lg px-3 py-1.5 text-[13px] font-medium transition", allow ? "surface shadow-card" : "text-muted hover:text-[var(--text)]")}>
            {allow ? "Edit allow list" : "Allow list only"}
          </button>
        </div>
      </Card>

      <Dialog
        open={open === "allowlist"}
        onClose={() => setOpen(null)}
        size="lg"
        title={
          <span className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-amber-500" /> {allow ? "Edit allow list" : "Allow only these devices"}
          </span>
        }
        description="Every device you don't tick will lose internet access, including new ones that join later."
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(null)}>
              Cancel
            </Button>
            <Button
              disabled={picked.size === 0}
              loading={apply.isPending}
              onClick={async () => {
                try {
                  await apply.mutateAsync({ mode: "allowlist", macs: [...picked] });
                  setOpen(null);
                } catch {}
              }}
            >
              {allow ? "Save allow list" : `Allow ${picked.size} device${picked.size === 1 ? "" : "s"}`}
            </Button>
          </>
        }
      >
        <Notice tone="amber" icon={<AlertTriangle />} className="mb-4">
          Make sure <b>the device you&apos;re using now</b> is ticked, or you&apos;ll lose internet on it.{me ? " We ticked it for you." : ""} While switching, internet may drop for a few seconds.
        </Notice>
        <ul className="max-h-[46vh] space-y-1 overflow-y-auto">
          {devices.map((d) => {
            const on = picked.has(d.mac);
            return (
              <li key={d.mac}>
                <label className={cn("flex cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2 transition", on ? "bg-brand-50/70 dark:bg-brand-500/10" : "hover:bg-[var(--surface-2)]")}>
                  <input
                    type="checkbox"
                    className="size-4 accent-[var(--color-brand-600)]"
                    checked={on}
                    onChange={(e) =>
                      setPicked((p) => {
                        const n = new Set(p);
                        if (e.target.checked) n.add(d.mac);
                        else n.delete(d.mac);
                        return n;
                      })
                    }
                  />
                  <DeviceIcon kind={guessKind(d, names[d.mac])} className="size-9 rounded-xl" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 truncate text-[14px] font-medium">
                      {displayName(d, names[d.mac])}
                      {d.mac === me && <Badge tone="brand">This device</Badge>}
                    </span>
                    <span className="block truncate font-mono text-[11.5px] text-muted">
                      {d.ipv4 ?? "offline"} · {d.mac.toUpperCase()}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </Dialog>

      <Dialog
        open={open === "blocklist"}
        onClose={() => setOpen(null)}
        size="sm"
        title="Switch back to block list?"
        description="Every device will be able to use the internet again. You can still block individual devices."
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(null)}>
              Cancel
            </Button>
            <Button
              loading={apply.isPending}
              onClick={async () => {
                try {
                  await apply.mutateAsync({ mode: "blocklist", macs: [] });
                  setOpen(null);
                } catch {}
              }}
            >
              Allow everyone
            </Button>
          </>
        }
      />
    </>
  );
}

export function useAccessLabels() {
  const { data } = useAccessControl();
  const allow = data?.mode === "allowlist";
  return {
    allow,
    blockLabel: allow ? "Remove" : "Block",
    unblockLabel: allow ? "Allow" : "Unblock",
    blockedBadge: allow ? "Not allowed" : "Blocked",
  };
}
