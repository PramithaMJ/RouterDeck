"use client";

import { ChevronRight, Gauge, KeyRound, LogOut, Monitor, Moon, Plug, Power, RotateCcw, Router, ShieldCheck, SlidersHorizontal, Sun } from "lucide-react";
import Link from "next/link";
import { IspBadge } from "@/components/isp-badge";
import { PhoneSetup } from "@/components/phone-setup";
import { DesktopPrefsCard } from "@/components/desktop-prefs";
import { desktopBridge } from "@/lib/transport/desktop";
import { Smartphone } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/app-shell";
import { useTheme } from "@/components/theme-toggle";
import { Badge, Button, Card, CardHeader, ConfirmDialog, CopyButton, Field, Notice, PasswordInput, Segmented, Spinner } from "@/components/ui";
import { resetDemo } from "@/lib/drivers/demo";
import { passwordStrength } from "@/lib/password";
import { useOverview, useRouterAction } from "@/lib/queries";
import { describeError, useSession } from "@/lib/session";
import { toast } from "@/lib/toast";

function Row({ label, value, copy }: { label: string; value?: string; copy?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 text-[14px]">
      <span className="text-muted">{label}</span>
      <span className="flex min-w-0 items-center gap-1 font-medium">
        <span className="truncate">{value ?? "-"}</span>
        {copy && value && <CopyButton value={value} />}
      </span>
    </div>
  );
}

function RebootOverlay({ onDone }: { onDone: () => void }) {
  const driver = useSession((s) => s.driver);
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    let stop = false;
    (async () => {
      await new Promise((r) => setTimeout(r, 25_000));
      while (!stop) {
        try {
          if (await driver?.isLoggedIn()) break;
          // Router is back but the session is gone: that's expected after a reboot.
          await driver?.getOverview();
          break;
        } catch (e) {
          if (/session|sign in/i.test(describeError(e))) break;
        }
        await new Promise((r) => setTimeout(r, 5000));
      }
      if (!stop) onDone();
    })();
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [driver, onDone]);
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[color-mix(in_oklch,var(--bg)_80%,transparent)] p-6 backdrop-blur-md">
      <Card className="w-full max-w-sm p-7 text-center shadow-pop">
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-[var(--surface-2)] text-[var(--text)]">
          <RotateCcw className="size-6 animate-spin [animation-duration:2.5s]" />
        </div>
        <h2 className="mt-5 text-lg font-semibold">Restarting your router</h2>
        <p className="mt-1.5 text-sm text-muted">This usually takes 1 to 3 minutes. Your internet and Wi-Fi will be down meanwhile. Keep this page open.</p>
        <p className="mt-5 font-mono text-sm text-muted">{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}</p>
      </Card>
    </div>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const { data } = useOverview();
  const connection = useSession((s) => s.connection);
  const transport = useSession((s) => s.transport);
  const caps = useSession((s) => s.driver?.capabilities);
  const signOut = useSession((s) => s.signOut);
  const expire = useSession((s) => s.expire);
  const { theme, setTheme } = useTheme();

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [rebootAsk, setRebootAsk] = useState(false);
  const [rebooting, setRebooting] = useState(false);

  const changePw = useRouterAction<{ current: string; next: string }>((d, v) => d.changeAdminPassword(v.current, v.next), {
    pending: "Updating router password…",
    success: "Router password changed. Use the new one next time you sign in.",
  });
  const reboot = useRouterAction<void>((d) => d.reboot(), {});

  useEffect(() => {
    if (window.location.hash === "#restart") document.getElementById("restart")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  const mismatch = confirm && next !== confirm;
  const strength = passwordStrength(next);

  return (
    <>
      <PageHeader title="Settings" description="Router details, admin password and restart." />

      {/* Mobile "More" hub */}
      <Card className="mb-5 p-2 lg:hidden">
        {[
          { href: "/speed-test/", label: "Speed test", icon: Gauge, show: true },
          { href: "/protection/", label: "Protection · block websites", icon: ShieldCheck, show: !!caps?.siteBlocking },
          { href: "/advanced/", label: "All router settings", icon: SlidersHorizontal, show: !!caps?.advanced },
        ]
          .filter((l) => l.show)
          .map((l) => (
            <Link key={l.href} href={l.href} className="flex items-center gap-3 rounded-xl px-3 py-3 text-[14.5px] font-medium transition hover:bg-[var(--surface-2)]">
              <l.icon className="size-5 text-brand-500" />
              <span className="flex-1">{l.label}</span>
              <ChevronRight className="size-4 text-muted" />
            </Link>
          ))}
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Your router" icon={<Router className="size-5 text-muted" />} />
          <div className="divide-y divide-[var(--border)] px-5 pb-3 pt-2 sm:px-6">
            {data?.identity.isp && (
              <div className="flex items-center justify-between gap-4 py-2.5 text-[14px]">
                <span className="text-muted">Provider</span>
                <IspBadge id={data.identity.isp} />
              </div>
            )}
            <Row label="Model" value={data?.identity.model} />
            <Row label="Firmware" value={data?.identity.firmware} />
            <Row label="Hardware" value={data?.identity.hardware} />
            <Row label="Router address" value={data?.lan.ip} copy />
            <Row label="Router MAC" value={data?.lan.mac?.toUpperCase()} copy />
            <Row label="DNS servers" value={data?.dns.slice(0, 2).join(", ")} />
            {data?.fiber?.rxPowerDbm !== undefined && <Row label="Fiber Rx / Tx" value={`${data.fiber.rxPowerDbm.toFixed(1)} / ${data.fiber.txPowerDbm?.toFixed(1) ?? "-"} dBm`} />}
          </div>
        </Card>

        {caps?.adminPassword && <Card>
          <CardHeader title="Router admin password" description="The password you use to sign in here (not the Wi-Fi password)." icon={<KeyRound className="size-5 text-muted" />} />
          <form
            className="space-y-4 p-5 sm:p-6"
            onSubmit={async (e) => {
              e.preventDefault();
              if (mismatch || next.length < 4) return;
              try {
                await changePw.mutateAsync({ current, next });
                setCurrent("");
                setNext("");
                setConfirm("");
              } catch {}
            }}
          >
            <Field label="Current password" htmlFor="cur">
              <PasswordInput id="cur" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
            </Field>
            <Field label="New password" htmlFor="new" hint={next ? strength.label : "Use something you don't use anywhere else."}>
              <PasswordInput id="new" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
            </Field>
            <Field label="Confirm new password" htmlFor="conf" error={mismatch ? "Passwords don't match" : undefined}>
              <PasswordInput id="conf" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
            </Field>
            <Button type="submit" disabled={!current || !next || !!mismatch} loading={changePw.isPending}>
              Change password
            </Button>
          </form>
        </Card>}

        {caps?.reboot && <Card id="restart">
          <CardHeader title="Restart router" description="Fixes most slow or stuck connections. Also saves settings permanently." icon={<Power className="size-5 text-muted" />} />
          <div className="p-5 sm:p-6">
            <Button variant="secondary" onClick={() => setRebootAsk(true)}>
              <RotateCcw className="size-4" /> Restart now
            </Button>
          </div>
        </Card>}

        <Card>
          <CardHeader title="This app" icon={<Plug className="size-5 text-muted" />} />
          <div className="space-y-5 p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3 text-[14px]">
              <span className="text-muted">Connected via</span>
              <Badge tone={connection?.transport === "demo" ? "amber" : "green"}>{transport?.label ?? "-"}</Badge>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 text-[14px]">
              <span className="text-muted">Appearance</span>
              <Segmented
                value={theme}
                onChange={setTheme}
                options={[
                  { value: "system", label: <Monitor className="size-4" aria-label="System" /> },
                  { value: "light", label: <Sun className="size-4" aria-label="Light" /> },
                  { value: "dark", label: <Moon className="size-4" aria-label="Dark" /> },
                ]}
              />
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                variant="secondary"
                onClick={async () => {
                  await signOut();
                  router.replace("/");
                }}
              >
                <LogOut className="size-4" /> Sign out
              </Button>
              {connection?.transport === "demo" && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    resetDemo();
                    toast.success("Demo router reset.");
                  }}
                >
                  Reset demo
                </Button>
              )}
            </div>
          </div>
        </Card>
      </div>

      <DesktopPrefsCard />

      {!desktopBridge() && <Card className="mt-5">
        <CardHeader title="Use on your phone" description="Manage your router from an iPhone or Android on the same Wi-Fi." icon={<Smartphone className="size-5 text-muted" />} />
        <div className="p-5 sm:p-6">
          <PhoneSetup compact />
        </div>
      </Card>}

      {connection?.transport !== "demo" && (
        <Notice tone="brand" className="mt-5">
          Need something this app doesn&apos;t cover yet? Your router&apos;s original page is still at{" "}
          <a className="font-mono underline" href={connection?.host} target="_blank" rel="noreferrer">
            {connection?.host.replace(/^https?:\/\//, "")}
          </a>
          .
        </Notice>
      )}

      <ConfirmDialog
        open={rebootAsk}
        onClose={() => setRebootAsk(false)}
        onConfirm={async () => {
          setRebootAsk(false);
          try {
            await reboot.mutateAsync();
            setRebooting(true);
          } catch {}
        }}
        loading={reboot.isPending}
        title="Restart your router?"
        description="Internet, Wi-Fi and phone service will be unavailable for 1 to 3 minutes."
        confirmLabel="Restart"
      />
      {rebooting && (
        <RebootOverlay
          onDone={() => {
            setRebooting(false);
            toast.success("Router is back. Please sign in again.");
            expire();
          }}
        />
      )}
      {reboot.isPending && !rebooting && (
        <div className="fixed bottom-24 right-6 lg:bottom-6">
          <Spinner />
        </div>
      )}
    </>
  );
}
