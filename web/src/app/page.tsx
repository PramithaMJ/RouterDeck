import { Ban, CloudOff, Gauge, KeyRound, QrCode, ShieldCheck, Smartphone, Wifi } from "lucide-react";
import { Logo } from "@/components/brand";
import { ConnectCard } from "@/components/connect-card";
import { ThemeToggle } from "@/components/theme-toggle";
import Link from "next/link";
import { DRIVERS, ROADMAP } from "@/lib/drivers";

const FEATURES = [
  { icon: Gauge, title: "Speed test", text: "Download, upload, ping and jitter with a live gauge." },
  { icon: Smartphone, title: "See who's online", text: "Every phone, laptop and TV on your Wi-Fi, with names you choose." },
  { icon: Ban, title: "Block anyone in one tap", text: "Cut a device's internet instantly. Unblock just as fast." },
  { icon: KeyRound, title: "Change Wi-Fi password", text: "Rename your network, set a strong password, done." },
  { icon: QrCode, title: "Share Wi-Fi with a QR", text: "Guests scan and join. No more spelling passwords." },
  { icon: ShieldCheck, title: "Block websites", text: "Keep distracting or unsafe sites off your network." },
  { icon: Wifi, title: "Fiber signal health", text: "Know if your line is healthy before you call the ISP." },
];

export default function Home() {
  return (
    <div className="relative min-h-dvh overflow-x-clip">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-40 -z-10 h-[520px] bg-[radial-gradient(60%_60%_at_50%_0%,color-mix(in_oklch,var(--color-brand-400)_28%,transparent),transparent)] dark:opacity-60" />

      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
        <Logo />
        <div className="flex items-center gap-1">
          <Link href="/speed-test/" className="hidden rounded-xl px-3 py-2 text-[13.5px] font-medium text-muted transition hover:bg-[var(--surface-2)] hover:text-[var(--text)] sm:inline-flex">
            Speed test
          </Link>
          <a href="https://github.com/PramithaMJ/RouterDeck" target="_blank" rel="noopener" className="hidden rounded-xl px-3 py-2 text-[13.5px] font-medium text-muted transition hover:bg-[var(--surface-2)] hover:text-[var(--text)] sm:inline-flex">
            GitHub
          </a>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-10 px-4 pb-16 pt-4 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:gap-14 lg:pt-12">
        <section className="animate-slide-up">
          <span className="inline-flex items-center gap-2 rounded-full border border-subtle surface px-3 py-1 text-[12.5px] text-muted shadow-card">
            <CloudOff className="size-3.5 text-brand-500" /> No cloud account. No app install.
          </span>
          <h1 className="mt-5 text-[2.35rem] font-semibold leading-[1.08] tracking-tight sm:text-5xl">
            Your home Wi-Fi,
            <br />
            <span className="bg-gradient-to-r from-brand-500 to-violet-500 bg-clip-text text-transparent">finally simple.</span>
          </h1>
          <p className="mt-5 max-w-xl text-[16.5px] leading-relaxed text-muted">
            RouterDeck replaces your router&apos;s confusing admin page with a clean dashboard. Block a device, change the Wi-Fi password or check your connection in seconds, on any router from SLT-Mobitel, Dialog and more.
          </p>

          <ul className="mt-8 grid gap-x-6 gap-y-5 sm:grid-cols-2">
            {FEATURES.map((f) => (
              <li key={f.title} className="flex gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl surface border border-subtle text-brand-600 shadow-card dark:text-brand-300">
                  <f.icon className="size-[18px]" />
                </span>
                <div>
                  <p className="text-[14.5px] font-medium">{f.title}</p>
                  <p className="text-[13px] leading-snug text-muted">{f.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="animate-slide-up [animation-delay:80ms] lg:sticky lg:top-8 lg:self-start">
          <ConnectCard />
        </section>
      </main>

      <section className="border-t border-subtle surface">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-3">
          <div>
            <h3 className="font-semibold">How it stays private</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Your router only answers inside your home. RouterDeck runs in your browser and reaches it through a small extension or connector on your own computer. Nothing passes through our servers, because there aren&apos;t any.
            </p>
          </div>
          <div>
            <h3 className="font-semibold">Supported routers</h3>
            <ul className="mt-2 space-y-1.5 text-sm">
              {DRIVERS.flatMap((d) => d.knownModels.map((m) => ({ m, beta: d.beta }))).map(({ m, beta }) => (
                <li key={m} className="flex items-start gap-2">
                  <span className={`mt-2 size-1.5 shrink-0 rounded-full ${beta ? "bg-amber-500" : "bg-emerald-500"}`} />
                  <span>
                    {m}
                    {beta && <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10.5px] font-medium text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">beta</span>}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="font-semibold">Coming next</h3>
            <ul className="mt-2 space-y-1.5 text-sm text-muted">
              {ROADMAP.map((r) => (
                <li key={r.name} className="flex items-start gap-2">
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-zinc-300 dark:bg-zinc-600" />
                  <span>
                    {r.name} <span className="opacity-70">· {r.isps}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <footer className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-[12.5px] text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>Independent open-source project. Not affiliated with SLT-Mobitel, Dialog, Starlink or any router maker. Logos belong to their owners.</p>
        <p className="flex items-center gap-3">
          <a href="https://github.com/PramithaMJ/RouterDeck" target="_blank" rel="noopener" className="hover:text-[var(--text)]">
            GitHub
          </a>
          <span aria-hidden>·</span>
          <a href="https://pramitha.lk" target="_blank" rel="noopener" className="hover:text-[var(--text)]">
            Built by <span className="font-semibold text-[var(--text)]">Pramitha</span>
          </a>
        </p>
      </footer>
    </div>
  );
}
