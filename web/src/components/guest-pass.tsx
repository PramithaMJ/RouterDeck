"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, Copy, KeyRound, Plus, QrCode, RefreshCw, Share2, ShieldCheck, Sparkles, Ticket, Users, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { bandsLabel, DURATIONS, formatRemaining, guestPassword, shareText, untilMidnight, useGuestPasses, type GuestPass } from "@/lib/guest-pass";
import { useDevices, useRouterAction } from "@/lib/queries";
import { useThisDevice } from "@/lib/this-device";
import type { Band, GuestWifi, RouterDriver } from "@/lib/router/types";
import { useSession } from "@/lib/session";
import { toast } from "@/lib/toast";
import { Badge, Button, Card, CardHeader, cn, Dialog, Field, Input, Notice, Skeleton, Switch } from "./ui";
import { WifiQrDialog } from "./wifi-qr";

export const guestKey = ["guest-wifi"] as const;

/** Every guest network the router lets RouterDeck use (slot 0, 1, …). */
async function readAllGuests(driver: RouterDriver): Promise<GuestWifi[]> {
  const first = await driver.getGuestWifi!(0);
  const n = Math.max(1, Math.min(4, first.networkSlots ?? 1));
  const out: GuestWifi[] = [{ ...first, slot: 0 }];
  for (let i = 1; i < n; i++) out.push({ ...(await driver.getGuestWifi!(i)), slot: i });
  return out;
}

function useNow(intervalMs = 15_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

/** Ends expired passes by switching the guest network off. Mount once in the app shell. */
export function GuestPassWatcher() {
  const driver = useSession((s) => s.driver);
  const host = useSession((s) => s.connection?.host) ?? "";
  const passes = useGuestPasses((s) => s.passes);
  const end = useGuestPasses((s) => s.end);
  const qc = useQueryClient();
  const now = useNow(20_000);
  const [busy, setBusy] = useState(false);
  const active = passes.find((p) => p.router === host && !p.endedAt && p.expiresAt && p.expiresAt <= now);
  useEffect(() => {
    if (!driver?.setGuestWifi || !active?.expiresAt || busy || active.expiresAt > now) return;
    setBusy(true);
    driver
      .setGuestWifi({ enabled: false, slot: active.slot ?? 0 })
      .then(() => {
        end(active.id, "expired");
        qc.invalidateQueries({ queryKey: guestKey });
        toast.info(`Guest pass for "${active.ssid}" expired. The guest network is now off.`);
      })
      .catch(() => {
        /* retry on next tick */
      })
      .finally(() => setBusy(false));
  }, [driver, active, now, busy, end, qc]);
  return null;
}

const BAND_CHOICES: { key: string; label: string; hint: string; bands: Band[] }[] = [
  { key: "both", label: "Both bands", hint: "Phones pick the best one", bands: ["2.4GHz", "5GHz"] },
  { key: "2.4", label: "2.4 GHz only", hint: "Reaches further, works with older devices", bands: ["2.4GHz"] },
  { key: "5", label: "5 GHz only", hint: "Faster, shorter range", bands: ["5GHz"] },
];

function CreateDialog({
  open,
  onClose,
  defaultName,
  availableBands,
  canIsolate = true,
  deviceLimit,
  slot = 0,
}: {
  open: boolean;
  onClose: () => void;
  defaultName: string;
  availableBands: Band[];
  canIsolate?: boolean;
  deviceLimit?: { min: number; max: number };
  slot?: number;
}) {
  const host = useSession((s) => s.connection?.host) ?? "";
  const start = useGuestPasses((s) => s.start);
  const [name, setName] = useState(defaultName);
  const [password, setPassword] = useState("");
  const [duration, setDuration] = useState<number | null | "midnight">(4 * 3_600_000);
  const [isolated, setIsolated] = useState(true);
  const [bandKey, setBandKey] = useState("both");
  // Guest device limit (routers that support one): a few sensible choices up to the router's max.
  const limitChoices = deviceLimit ? [...new Set([2, 4, 8, deviceLimit.max].filter((n) => n >= deviceLimit.min && n <= deviceLimit.max))] : [];
  const [maxDevices, setMaxDevices] = useState<number | undefined>(undefined);
  const chosenMax = deviceLimit ? (maxDevices ?? Math.min(8, deviceLimit.max)) : undefined;
  // Which band is the device you're using on? Changing a band briefly
  // restarts its Wi-Fi, so the guest network defaults to the other one.
  const { data: devices } = useDevices();
  const thisMac = useThisDevice((s) => s.byRouter[host]);
  const myBand = devices?.find((d) => d.mac === thisMac && d.online)?.band;
  const dualBand = availableBands.includes("2.4GHz") && availableBands.includes("5GHz");
  useEffect(() => {
    if (!open) return;
    setName(defaultName);
    setPassword(guestPassword());
    setBandKey(dualBand && myBand === "5GHz" ? "2.4" : dualBand && myBand === "2.4GHz" ? "5" : "both");
  }, [open, defaultName, dualBand, myBand]);

  const bands = dualBand ? BAND_CHOICES.find((c) => c.key === bandKey)!.bands : availableBands;

  const create = useRouterAction<{ ssid: string; password: string; isolated: boolean; bands: Band[]; maxDevices?: number; expiresAt: number | null }>(
    async (d, v) => {
      await d.setGuestWifi!({ enabled: true, slot, ssid: v.ssid, password: v.password, isolated: v.isolated, bands: v.bands.length ? v.bands : undefined, maxDevices: v.maxDevices });
      start({ router: host, slot, ssid: v.ssid, password: v.password, bands: v.bands.length ? v.bands : undefined, maxDevices: v.maxDevices, expiresAt: v.expiresAt });
    },
    { invalidate: [guestKey], pending: "Creating the guest network…", success: "Guest pass ready. Share it below." },
  );

  const nameErr = !name.trim() ? "Give the guest network a name" : name.length > 32 ? "Max 32 characters" : null;
  const pwErr = password.length < 8 ? "At least 8 characters" : password.length > 63 ? "Max 63 characters" : null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title="New guest pass"
      description="Guests get a separate Wi-Fi with its own password. Your main Wi-Fi password stays private."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!!nameErr || !!pwErr}
            loading={create.isPending}
            onClick={async () => {
              const expiresAt = duration === "midnight" ? untilMidnight() : duration === null ? null : Date.now() + duration;
              try {
                await create.mutateAsync({ ssid: name.trim(), password, isolated, bands, maxDevices: chosenMax, expiresAt });
                onClose();
              } catch {}
            }}
          >
            <Ticket className="size-4" /> Create pass
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div>
          <p className="mb-2 text-[13px] font-medium">How long?</p>
          <div className="flex flex-wrap gap-1.5">
            {[...DURATIONS.slice(0, 2), { label: "Until midnight", ms: "midnight" as const }, ...DURATIONS.slice(2)].map((d) => (
              <button
                key={d.label}
                onClick={() => setDuration(d.ms)}
                className={cn("rounded-lg border px-3 py-1.5 text-[13px] font-medium transition", duration === d.ms ? "border-[var(--text)] bg-[var(--surface)]" : "border-subtle text-muted hover:text-[var(--text)]")}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>
        <Field label="Guest network name" htmlFor="gname" error={nameErr}>
          <Input id="gname" value={name} onChange={(e) => setName(e.target.value)} maxLength={32} spellCheck={false} />
        </Field>
        <Field label="Password" htmlFor="gpass" error={pwErr} hint="Easy to read out loud. Changes for every new pass.">
          <div className="flex gap-2">
            <Input id="gpass" value={password} onChange={(e) => setPassword(e.target.value)} className="font-mono" spellCheck={false} autoComplete="off" />
            <Button variant="secondary" size="lg" className="h-11 shrink-0 px-3.5" onClick={() => setPassword(guestPassword())} title="New password">
              <Sparkles className="size-[18px]" />
            </Button>
          </div>
        </Field>
        {dualBand && (
          <div>
            <p className="mb-2 text-[13px] font-medium">Which Wi-Fi band?</p>
            <div className="grid gap-1.5 sm:grid-cols-3" role="radiogroup" aria-label="Wi-Fi band">
              {BAND_CHOICES.map((c) => (
                <button
                  key={c.key}
                  role="radio"
                  aria-checked={bandKey === c.key}
                  onClick={() => setBandKey(c.key)}
                  className={cn("rounded-lg border px-3 py-2 text-left transition", bandKey === c.key ? "border-[var(--text)] bg-[var(--surface)]" : "border-subtle hover:border-[var(--text)]/40")}
                >
                  <span className="block text-[13px] font-medium">{c.label}</span>
                  <span className="block text-[12px] leading-snug text-muted">{c.hint}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        <p className="-mt-1 text-[12.5px] leading-relaxed text-muted">
          Creating the guest network restarts Wi-Fi on {bands.length > 1 ? "both bands" : `the ${bands[0]?.replace("GHz", " GHz") ?? "chosen"} band`} for about 15 seconds. Devices on it reconnect by themselves.
          {myBand && dualBand && (
            <>
              {" "}This device is on <b>{myBand.replace("GHz", " GHz")}</b>
              {bands.includes(myBand) ? ", so it will drop briefly too." : ", so it stays connected."}
            </>
          )}
        </p>
        {deviceLimit && limitChoices.length > 0 && (
          <div>
            <p className="mb-2 text-[13px] font-medium">How many guests?</p>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Maximum guest devices">
              {limitChoices.map((n) => (
                <button
                  key={n}
                  role="radio"
                  aria-checked={chosenMax === n}
                  onClick={() => setMaxDevices(n)}
                  className={cn("rounded-lg border px-3 py-1.5 text-[13px] font-medium transition", chosenMax === n ? "border-[var(--text)] bg-[var(--surface)]" : "border-subtle text-muted hover:text-[var(--text)]")}
                >
                  {n === deviceLimit.max ? `Up to ${n} (max)` : `Up to ${n}`}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[12px] text-muted">Devices on the guest Wi-Fi at the same time. This router allows up to {deviceLimit.max}.</p>
          </div>
        )}
        {canIsolate && <div className="flex items-center justify-between gap-4 rounded-lg bg-[var(--surface-2)] px-3.5 py-3">
          <div>
            <p className="text-[13.5px] font-medium">Keep guests separate</p>
            <p className="text-[12.5px] text-muted">Guests can use the internet but not see each other&apos;s devices.</p>
          </div>
          <Switch checked={isolated} onChange={setIsolated} label="Keep guests separate" />
        </div>}
      </div>
    </Dialog>
  );
}

/** One running pass: details, QR, share, extend, new password, revoke, and a check against the router. */
function PassPanel({ pass, router, showWhen }: { pass: GuestPass; router?: GuestWifi; showWhen: boolean }) {
  const host = useSession((s) => s.connection?.host) ?? "";
  const transportKind = useSession((s) => s.transport?.kind);
  const end = useGuestPasses((s) => s.end);
  const extend = useGuestPasses((s) => s.extend);
  const start = useGuestPasses((s) => s.start);
  const now = useNow(15_000);
  const [qr, setQr] = useState(false);
  const slot = pass.slot ?? 0;

  // Is the router actually broadcasting this pass? (It may have been changed or
  // turned off on the router itself, or a change didn't stick.)
  const mismatch = router
    ? !router.enabled
      ? "off"
      : (router.ssid && router.ssid !== pass.ssid) || (router.password && router.password !== pass.password)
        ? "different"
        : null
    : null;

  const revoke = useRouterAction<GuestPass>(
    async (d, p) => {
      await d.setGuestWifi!({ enabled: false, slot: p.slot ?? 0 });
      end(p.id, "revoked");
    },
    { invalidate: [guestKey], pending: "Turning off this guest network…", success: "Revoked. Guests on it are disconnected." },
  );
  const fix = useRouterAction<GuestPass>(
    async (d, p) => {
      await d.setGuestWifi!({ enabled: true, slot: p.slot ?? 0, ssid: p.ssid, password: p.password, bands: p.bands, maxDevices: p.maxDevices });
    },
    { invalidate: [guestKey], pending: "Applying the pass on the router…", success: "Fixed. The guest network matches this pass again." },
  );
  const rotate = useRouterAction<GuestPass>(
    async (d, p) => {
      const password = guestPassword();
      await d.setGuestWifi!({ enabled: true, slot: p.slot ?? 0, ssid: p.ssid, password, bands: p.bands, maxDevices: p.maxDevices });
      start({ router: host, slot: p.slot ?? 0, ssid: p.ssid, password, bands: p.bands, maxDevices: p.maxDevices, expiresAt: p.expiresAt });
    },
    { invalidate: [guestKey], pending: "Changing the guest password…", success: "New guest password set. Old one no longer works." },
  );

  async function share(p: GuestPass) {
    const text = shareText(p);
    try {
      if (navigator.share) await navigator.share({ title: "Wi-Fi", text });
      else {
        await navigator.clipboard.writeText(text);
        toast.success("Copied. Paste it into WhatsApp, SMS or email.");
      }
    } catch {}
  }

  const remaining = pass.expiresAt ? pass.expiresAt - now : null;

  return (
    <div className="space-y-4">
      {mismatch && (
        <Notice tone="amber" icon={<Users />}>
          {mismatch === "off" ? "This guest network is turned off on the router, so the pass won't work right now." : "The router's guest network has a different name or password than this pass, so its QR code won't work."}
          <div className="mt-2.5">
            <Button size="sm" onClick={() => fix.mutate(pass)} loading={fix.isPending}>
              Fix it
            </Button>
          </div>
        </Notice>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg bg-[var(--surface-2)] p-3.5">
          <p className="label-caps">Network{showWhen ? ` ${slot + 1}` : ""}</p>
          <p className="mt-1 truncate font-medium">{pass.ssid}</p>
          <p className="mt-0.5 text-[12px] text-muted">
            {bandsLabel(pass.bands, router?.availableBands)}
            {(pass.maxDevices ?? router?.maxDevices) ? ` · up to ${pass.maxDevices ?? router?.maxDevices} devices` : ""}
          </p>
        </div>
        <div className="rounded-lg bg-[var(--surface-2)] p-3.5">
          <p className="label-caps">Password</p>
          <p className="mt-1 flex items-center gap-1.5 font-mono font-medium">
            {pass.password}
            <button className="text-muted hover:text-[var(--text)]" onClick={() => navigator.clipboard.writeText(pass.password).then(() => toast.success("Password copied"))} aria-label="Copy password">
              <Copy className="size-3.5" />
            </button>
          </p>
        </div>
        <div className="rounded-lg bg-[var(--surface-2)] p-3.5">
          <p className="label-caps">Expires</p>
          <p className={cn("mt-1 flex items-center gap-1.5 font-medium", remaining !== null && remaining < 15 * 60_000 && "text-amber-600 dark:text-amber-400")}>
            <Clock className="size-3.5" /> {remaining === null ? "When you revoke it" : formatRemaining(remaining)}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setQr(true)}>
          <QrCode className="size-4" /> Show QR
        </Button>
        <Button variant="secondary" onClick={() => share(pass)}>
          <Share2 className="size-4" /> Share
        </Button>
        {pass.expiresAt && (
          <>
            <Button variant="secondary" onClick={() => extend(pass.id, Math.max(pass.expiresAt!, Date.now()) + 3_600_000)}>
              +1 hour
            </Button>
            <Button variant="secondary" onClick={() => extend(pass.id, Math.max(pass.expiresAt!, Date.now()) + 86_400_000)}>
              +1 day
            </Button>
          </>
        )}
        <Button variant="ghost" onClick={() => rotate.mutate(pass)} loading={rotate.isPending}>
          <RefreshCw className="size-4" /> New password
        </Button>
        <Button variant="soft-danger" onClick={() => revoke.mutate(pass)} loading={revoke.isPending}>
          <XCircle className="size-4" /> Revoke now
        </Button>
      </div>
      {transportKind !== "desktop" && pass.expiresAt && !showWhen && (
        <p className="text-[12.5px] text-muted">
          RouterDeck turns the guest network off when time is up while it&apos;s open. Close it earlier and it happens next time you open RouterDeck, or use the RouterDeck desktop app, which does it on time in the background.
        </p>
      )}
      <WifiQrDialog network={{ id: `guest-${slot}`, band: pass.bands?.length === 1 ? pass.bands[0] : "2.4GHz", enabled: true, ssid: pass.ssid, password: pass.password, security: "WPA2-Personal", editable: { ssid: false, password: false, enabled: false } }} open={qr} onClose={() => setQr(false)} />
    </div>
  );
}

export function GuestPassCard({ mainSsid }: { mainSsid?: string }) {
  const driver = useSession((s) => s.driver);
  const host = useSession((s) => s.connection?.host) ?? "";
  const transportKind = useSession((s) => s.transport?.kind);
  const passes = useGuestPasses((s) => s.passes);
  const [creating, setCreating] = useState<number | null>(null);

  const { data: guests, isLoading } = useQuery({
    queryKey: guestKey,
    queryFn: () => readAllGuests(driver!),
    enabled: !!driver?.getGuestWifi,
    staleTime: 60_000,
    refetchInterval: 60_000, // notice if a guest network changes on the router
  });
  const guest = guests?.[0];
  const slots = guests?.length ?? 1;

  const actives = passes.filter((p) => p.router === host && !p.endedAt).sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0));
  const passOn = (slot: number) => actives.find((p) => (p.slot ?? 0) === slot);
  // Guest networks that are on but weren't created by RouterDeck.
  const foreign = (guests ?? []).filter((g) => g.enabled && !passOn(g.slot ?? 0));
  // Where the next pass goes: a network that's off and has no pass, else one RouterDeck doesn't manage.
  const freeSlot = (guests ?? [{ slot: 0, enabled: false } as GuestWifi]).find((g) => !g.enabled && !passOn(g.slot ?? 0))?.slot ?? foreign[0]?.slot;
  const history = passes.filter((p) => p.router === host && p.endedAt).slice(0, 4);

  const turnOff = useRouterAction<number>(
    async (d, slot) => {
      await d.setGuestWifi!({ enabled: false, slot });
    },
    { invalidate: [guestKey], pending: "Turning off the guest network…", success: "Turned off." },
  );

  // iPhones remember the password of every network *name* they've seen and
  // won't take a new one for the same name ("Unable to join"). So a new pass
  // gets a name not used by an earlier pass: -Guest, -Guest2, -Guest3, …
  const defaultName = useMemo(() => {
    const base = (mainSsid || "Home").replace(/[-_ ]?(2\.4G|5G|2G)(?![a-z0-9.]).*$/i, "").slice(0, 24);
    const used = new Set(passes.filter((p) => p.router === host).map((p) => p.ssid));
    for (let n = 1; n < 100; n++) {
      const name = `${base}-Guest${n === 1 ? "" : n}`;
      if (!used.has(name)) return name;
    }
    return `${base}-Guest`;
  }, [mainSsid, passes, host]);

  if (!driver?.getGuestWifi) return null;
  const several = slots > 1;

  return (
    <Card className="mb-5 overflow-hidden">
      <CardHeader
        icon={
          <div className="flex size-11 items-center justify-center rounded-xl bg-[var(--surface-2)]">
            <Ticket className="size-5" />
          </div>
        }
        title="Guest passes"
        description={
          <>
            Share Wi-Fi with visitors using a temporary password you can revoke any time.
            {guest ? (
              <span className="mt-1 block text-[12px]">
                {several ? `Up to ${slots} passes at the same time on this router, each with its own network and password` : "One pass at a time on this router"}
                {guest.deviceLimit ? `; up to ${guest.deviceLimit.max} devices per pass` : ""}.
              </span>
            ) : null}
          </>
        }
        action={actives.length ? <Badge tone="green">{actives.length > 1 ? `${actives.length} active` : "Active"}</Badge> : foreign.length ? <Badge tone="amber">Guest Wi-Fi on</Badge> : undefined}
      />

      <div className="p-5 sm:p-6">
        {isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : (
          <div className="space-y-5">
            {actives.map((p, i) => (
              <div key={p.id} className={cn(i > 0 && "border-t border-subtle pt-5")}>
                <PassPanel pass={p} router={guests?.find((g) => (g.slot ?? 0) === (p.slot ?? 0))} showWhen={several && actives.length > 1} />
              </div>
            ))}

            {foreign.map((g) => (
              <Notice key={`f-${g.slot}`} tone="amber" icon={<Users />}>
                A guest network <b>{g.ssid}</b> is on, but it wasn&apos;t created here. Turn it off, or create a pass on it to take control.
                <div className="mt-3 flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => turnOff.mutate(g.slot ?? 0)} loading={turnOff.isPending && turnOff.variables === (g.slot ?? 0)}>
                    Turn off
                  </Button>
                  <Button size="sm" onClick={() => setCreating(g.slot ?? 0)}>
                    New pass
                  </Button>
                </div>
              </Notice>
            ))}

            {actives.length === 0 && foreign.length === 0 ? (
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <ul className="flex-1 space-y-1.5 text-[13.5px] text-muted">
                  <li className="flex items-center gap-2">
                    <KeyRound className="size-4" /> Your main Wi-Fi password stays private
                  </li>
                  <li className="flex items-center gap-2">
                    <Clock className="size-4" /> Expires automatically after the time you choose
                  </li>
                  <li className="flex items-center gap-2">
                    <ShieldCheck className="size-4" /> Revoke any time to disconnect everyone on it
                  </li>
                </ul>
                <Button size="lg" onClick={() => setCreating(freeSlot ?? 0)}>
                  <Ticket className="size-4" /> Create a guest pass
                </Button>
              </div>
            ) : actives.length > 0 && freeSlot !== undefined && !passOn(freeSlot) ? (
              <div className="flex flex-col gap-3 rounded-xl border border-dashed border-subtle p-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-[13px] text-muted">
                  {actives.length} of {slots} guest networks in use. Give another visitor their own network and password.
                </p>
                <Button variant="secondary" onClick={() => setCreating(freeSlot)}>
                  <Plus className="size-4" /> Create another guest pass
                </Button>
              </div>
            ) : actives.length > 0 && several ? (
              <p className="text-[12.5px] text-muted">All {slots} guest networks are in use. Revoke one to create another.</p>
            ) : null}

            {actives.length > 0 && (
              <p className="text-[12.5px] leading-relaxed text-muted">
                <b className="font-medium text-[var(--text)]">iPhone can&apos;t join?</b> It may remember an older guest password for that network name. On the iPhone: Settings → Wi-Fi → ⓘ → Forget This Network, then scan the QR again. Creating, changing or revoking a pass restarts that guest Wi-Fi for a few seconds.
                {transportKind !== "desktop" && actives.some((p) => p.expiresAt) && actives.length > 1
                  ? " Passes end on time while RouterDeck is open (or always, with the desktop app running)."
                  : ""}
              </p>
            )}
          </div>
        )}

        {history.length > 0 && (
          <div className="mt-5 border-t border-subtle pt-4">
            <p className="label-caps mb-2">Recent passes</p>
            <ul className="space-y-1 text-[13px]">
              {history.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3">
                  <span className="truncate">
                    {p.ssid} <span className="font-mono text-muted">· {p.password}</span>
                  </span>
                  <span className="shrink-0 text-[12px] text-muted">
                    {p.endReason} {new Date(p.endedAt!).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <CreateDialog
        open={creating !== null}
        onClose={() => setCreating(null)}
        slot={creating ?? 0}
        defaultName={defaultName}
        availableBands={(guests?.find((g) => (g.slot ?? 0) === (creating ?? 0)) ?? guest)?.availableBands ?? []}
        canIsolate={guest?.canIsolate !== false}
        deviceLimit={(guests?.find((g) => (g.slot ?? 0) === (creating ?? 0)) ?? guest)?.deviceLimit}
      />
    </Card>
  );
}
