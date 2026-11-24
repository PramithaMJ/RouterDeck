"use client";

import { Gauge, LayoutGrid, LogOut, Menu, Plug, Settings, ShieldCheck, SlidersHorizontal, Smartphone, Wifi } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { DriverCapabilities } from "@/lib/router/types";
import { ispById } from "@/lib/isp";
import { useOverview } from "@/lib/queries";
import { useSession } from "@/lib/session";
import { Logo, LogoMark } from "./brand";
import { IspLogo } from "./isp-badge";
import { ThemeToggle } from "./theme-toggle";
import { Badge, cn, Spinner, StatusDot } from "./ui";

type NavItem = { href: string; label: string; short?: string; icon: typeof Wifi; cap?: keyof DriverCapabilities; public?: boolean; mobile?: boolean };

export const NAV: NavItem[] = [
  { href: "/dashboard/", label: "Home", icon: LayoutGrid, mobile: true },
  { href: "/devices/", label: "Devices", icon: Smartphone, cap: "devices", mobile: true },
  { href: "/wifi/", label: "Wi-Fi", icon: Wifi, cap: "wifi", mobile: true },
  { href: "/protection/", label: "Protection", icon: ShieldCheck, cap: "siteBlocking" },
  { href: "/speed-test/", label: "Speed test", short: "Speed", icon: Gauge, public: true, mobile: true },
  { href: "/advanced/", label: "All settings", icon: SlidersHorizontal, cap: "advanced" },
  { href: "/settings/", label: "Settings", icon: Settings },
];

const PUBLIC_ROUTES = NAV.filter((n) => n.public).map((n) => n.href);

function useActive() {
  const path = (usePathname() ?? "").replace(/\/?$/, "/");
  return (href: string) => path.startsWith(href);
}

function RouterChip() {
  const connection = useSession((s) => s.connection);
  const { data } = useOverview();
  const online = data?.internet.online;
  const isp = ispById(data?.identity.isp);
  return (
    <div className="rounded-2xl border border-subtle surface p-3 shadow-card">
      <div className="flex items-center gap-2.5">
        {isp ? <IspLogo isp={isp} /> : <StatusDot tone={data ? (online ? "green" : "red") : "neutral"} pulse={online} />}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[13.5px] font-medium">{data?.identity.model ?? connection?.model ?? "Router"}</span>
            {connection?.transport === "demo" && <Badge tone="amber">Demo</Badge>}
          </div>
          <p className="flex items-center gap-1.5 truncate text-[11.5px] text-muted">
            {isp && <StatusDot tone={data ? (online ? "green" : "red") : "neutral"} />}
            {isp ? isp.name : connection?.transport === "demo" ? "simulated" : connection?.host.replace(/^https?:\/\//, "")}
          </p>
        </div>
      </div>
    </div>
  );
}

export function BuiltBy({ className }: { className?: string }) {
  return (
    <a href="https://pramitha.lk" target="_blank" rel="noopener" className={cn("text-[12px] text-muted transition hover:text-[var(--text)]", className)}>
      Built by <span className="font-semibold text-[var(--text)]">Pramitha</span>
    </a>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const phase = useSession((s) => s.phase);
  const driver = useSession((s) => s.driver);
  const signOut = useSession((s) => s.signOut);
  const connection = useSession((s) => s.connection);
  const router = useRouter();
  const path = (usePathname() ?? "").replace(/\/?$/, "/");
  const isActive = useActive();
  const isPublic = PUBLIC_ROUTES.some((r) => path.startsWith(r));
  const connected = phase === "connected";
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (phase === "disconnected" && !isPublic) router.replace("/");
  }, [phase, router, isPublic]);

  if (!mounted || (!connected && !isPublic)) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-sm text-muted">
          <LogoMark className="size-10" />
          <Spinner />
        </div>
      </div>
    );
  }

  const caps = driver?.capabilities;
  const items = NAV.filter((n) => (connected ? !n.cap || caps?.[n.cap] : n.public));
  const mobileItems = connected ? [...items.filter((n) => n.mobile), { href: "/settings/", label: "More", icon: Menu }] : items;

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[252px_1fr]">
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-subtle px-4 py-5 lg:flex">
        <Logo href={connected ? "/dashboard/" : "/"} className="px-2" />
        <nav className="mt-8 space-y-1" aria-label="Main">
          {items.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-medium transition",
                isActive(n.href) ? "surface text-[var(--text)] shadow-card ring-1 ring-[var(--border)]" : "text-muted hover:bg-[var(--surface-2)] hover:text-[var(--text)]",
              )}
            >
              <n.icon className={cn("size-[18px]", isActive(n.href) && "text-brand-600 dark:text-brand-300")} />
              {n.label}
            </Link>
          ))}
          {!connected && (
            <Link href="/" className="mt-2 flex items-center gap-3 rounded-xl bg-brand-600 px-3 py-2.5 text-[14px] font-medium text-white shadow-sm hover:bg-brand-700">
              <Plug className="size-[18px]" /> Connect router
            </Link>
          )}
        </nav>
        <div className="mt-auto space-y-3">
          {connected && <RouterChip />}
          <div className="flex items-center justify-between">
            {connected ? (
              <button
                onClick={() => signOut()}
                className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-[13px] text-muted transition hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
              >
                <LogOut className="size-4" /> Sign out
              </button>
            ) : (
              <span />
            )}
            <ThemeToggle />
          </div>
          <BuiltBy className="block px-3" />
        </div>
      </aside>

      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-subtle bg-[color-mix(in_oklch,var(--bg)_85%,transparent)] px-4 py-3 backdrop-blur-xl lg:hidden">
        <Logo href={connected ? "/dashboard/" : "/"} />
        <div className="flex items-center gap-1">
          {connection?.transport === "demo" && <Badge tone="amber">Demo</Badge>}
          {!connected && (
            <Link href="/" className="rounded-lg bg-brand-600 px-3 py-1.5 text-[12.5px] font-medium text-white">
              Connect
            </Link>
          )}
          <ThemeToggle />
        </div>
      </header>

      <main className="min-w-0 px-4 pb-28 pt-5 sm:px-6 lg:px-10 lg:pb-12 lg:pt-8">
        <div className="mx-auto max-w-5xl animate-fade-in">{children}</div>
        <div className="mx-auto mt-10 flex max-w-5xl justify-center lg:hidden">
          <BuiltBy />
        </div>
      </main>

      {mobileItems.length > 1 && (
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-subtle bg-[color-mix(in_oklch,var(--surface)_88%,transparent)] backdrop-blur-xl safe-bottom lg:hidden" aria-label="Main">
          <div className="mx-auto grid max-w-md" style={{ gridTemplateColumns: `repeat(${mobileItems.length}, minmax(0, 1fr))` }}>
            {mobileItems.map((n) => {
              const active = n.label === "More" ? ["/settings/", "/protection/", "/advanced/"].some((h) => path.startsWith(h)) : isActive(n.href);
              return (
                <Link key={n.label} href={n.href} className={cn("flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition", active ? "text-brand-600 dark:text-brand-300" : "text-muted")}>
                  <n.icon className="size-[22px]" strokeWidth={active ? 2.2 : 1.8} />
                  {n.short ?? n.label}
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}

export function PageHeader({ title, description, action }: { title: string; description?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-[1.65rem] font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}
