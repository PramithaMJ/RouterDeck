import { ArrowUpRight, Plus } from "lucide-react";
import Link from "next/link";
import { BuiltByFooter } from "@/components/built-by";
import { Logo } from "@/components/brand";
import { ConnectCard } from "@/components/connect-card";
import { IspStrip } from "@/components/isp-strip";
import { ProductPreview } from "@/components/product-preview";
import { ThemeToggle } from "@/components/theme-toggle";
import { DRIVERS, ROADMAP } from "@/lib/drivers";

const CAN_DO = [
  ["See who's on your Wi-Fi", "Every phone, laptop and TV, with names you choose instead of MAC addresses."],
  ["Cut someone off, then let them back", "Block a device's internet in one tap, or allow only the devices you trust."],
  ["Change the Wi-Fi password properly", "Rename the network, generate a strong password, share it with a QR code."],
  ["Test your real speed", "Download, upload, ping and latency under load, measured from this device."],
  ["Every other setting, made readable", "DHCP, port forwarding, DMZ, UPnP, diagnostics: the router's full menu, redrawn."],
  ["Know if the line is the problem", "Fiber power, 4G signal or Starlink obstructions, before you call the ISP."],
];

const STEPS = [
  ["Open RouterDeck", "On a computer that's on your home Wi-Fi."],
  ["Pick how to connect", "No download: drag the RouterDeck bookmark and click it on your router's page. Or use the extension, or the RouterDeck Connect app (which also lets phones join)."],
  ["Sign in once", "RouterDeck finds your router and your provider. Use the password on the router's label."],
];

const FAQ = [
  [
    "Is it safe to type my router password here?",
    "Your password goes from your browser straight to your router, through the bridge on your own computer. RouterDeck has no servers, no accounts and stores nothing. The code is open source, so anyone can check.",
  ],
  [
    "Do I have to download anything?",
    "No. Drag the RouterDeck bookmark to your bookmarks bar, open your router's page (usually 192.168.1.1) and click it. RouterDeck opens connected through that tab. Browsers (rightly) stop public websites from reaching your router directly, so the bookmark works from inside your router's own page. The extension and the RouterDeck Connect app are optional extras for one-click use and for phones.",
  ],
  [
    "Which routers work?",
    "SLT-Mobitel fiber routers built on Realtek (like the HG7) are fully supported. Huawei 4G routers used by Dialog, Mobitel, Hutch and Airtel, and the Starlink dish, are in beta. Others are on the way. Open an issue to request yours.",
  ],
  ["Does it work on my phone?", "The speed test and the demo do. Managing a router needs the bridge, which runs on a computer for now."],
  [
    "Will it break my router?",
    "RouterDeck uses your router's own forms and checks, the same as clicking around its admin page. Anything risky (restart, allow-list mode, deleting rules) asks you to confirm first.",
  ],
];

export default function Home() {
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
        <Logo />
        <nav className="flex items-center gap-0.5 text-[13.5px]">
          <Link href="/speed-test/" className="hidden rounded-lg px-3 py-2 text-muted transition hover:text-[var(--text)] sm:inline-flex">
            Speed test
          </Link>
          <a href="#faq" className="hidden rounded-lg px-3 py-2 text-muted transition hover:text-[var(--text)] sm:inline-flex">
            FAQ
          </a>
          <a href="https://github.com/PramithaMJ/RouterDeck" target="_blank" rel="noopener" className="hidden rounded-lg px-3 py-2 text-muted transition hover:text-[var(--text)] sm:inline-flex">
            GitHub
          </a>
          <ThemeToggle />
        </nav>
      </header>

      {/* Hero */}
      <main className="mx-auto grid max-w-6xl gap-10 px-4 pb-20 pt-6 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:gap-16 lg:pt-14">
        <section className="animate-slide-up">
          <p className="label-caps">For homes on SLT-Mobitel · Dialog · Mobitel · Hutch · Starlink</p>
          <h1 className="mt-5 max-w-[15ch] text-[2.6rem] font-semibold leading-[1.02] tracking-[-0.035em] sm:text-[3.6rem]">
            Your router, without the old admin page.
          </h1>
          <p className="mt-6 max-w-[52ch] text-[17px] leading-relaxed text-muted">
            RouterDeck is a clear, calm control panel for the router your internet provider gave you. See who&apos;s online, cut a device off for the night, change the Wi-Fi password or test your speed, in plain language and on any screen.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 text-[13.5px]">
            <span className="flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-emerald-500" /> Free and open source
            </span>
            <span className="flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-emerald-500" /> No account, no cloud
            </span>
            <span className="flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-emerald-500" /> Password never stored
            </span>
          </div>
          <div className="mt-10 hidden lg:block">
            <ProductPreview />
          </div>
        </section>

        <section id="connect" className="animate-slide-up [animation-delay:60ms] lg:sticky lg:top-8 lg:self-start">
          <ConnectCard />
          <p className="mt-3 text-center text-[12.5px] text-muted">
            Just curious?{" "}
            <Link href="/speed-test/" className="font-medium text-[var(--text)] underline decoration-[var(--border)] underline-offset-4 hover:decoration-[var(--text)]">
              Run a speed test
            </Link>{" "}
            without connecting anything.
          </p>
        </section>

        <div className="lg:hidden">
          <ProductPreview />
        </div>
      </main>

      <IspStrip />

      {/* What you can do */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="grid gap-12 lg:grid-cols-[1fr_2fr]">
          <div>
            <p className="label-caps">What you can do</p>
            <h2 className="mt-3 text-[1.9rem] font-semibold leading-tight tracking-[-0.03em]">The things people actually open the router page for.</h2>
          </div>
          <dl className="grid gap-x-10 gap-y-8 sm:grid-cols-2">
            {CAN_DO.map(([t, d], i) => (
              <div key={t} className="border-t border-subtle pt-4">
                <dt className="flex items-baseline gap-3 text-[15.5px] font-semibold tracking-[-0.01em]">
                  <span className="font-mono text-[11px] font-normal text-muted">{String(i + 1).padStart(2, "0")}</span>
                  {t}
                </dt>
                <dd className="mt-1.5 pl-[30px] text-[14px] leading-relaxed text-muted">{d}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* How it works */}
      <section className="border-y border-subtle bg-[var(--surface)]">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="grid gap-12 lg:grid-cols-[1fr_2fr]">
            <div>
              <p className="label-caps">How it works</p>
              <h2 className="mt-3 text-[1.9rem] font-semibold leading-tight tracking-[-0.03em]">Three minutes, once.</h2>
              <p className="mt-4 max-w-[38ch] text-[14.5px] leading-relaxed text-muted">
                Your router only answers inside your home, so RouterDeck runs in your browser and reaches it through a tiny bridge on your own computer. Nothing passes through our servers, because there aren&apos;t any.
              </p>
            </div>
            <ol className="grid gap-6 sm:grid-cols-3">
              {STEPS.map(([t, d], i) => (
                <li key={t}>
                  <span className="flex size-9 items-center justify-center rounded-lg border border-subtle font-mono text-[13px]">{i + 1}</span>
                  <p className="mt-4 text-[15.5px] font-semibold tracking-[-0.01em]">{t}</p>
                  <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{d}</p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* Support + FAQ */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="grid gap-12 lg:grid-cols-[1fr_2fr]">
          <div>
            <p className="label-caps">Routers</p>
            <ul className="mt-4 space-y-2.5 text-[14px]">
              {DRIVERS.flatMap((d) => d.knownModels.map((m) => ({ m, beta: d.beta }))).map(({ m, beta }) => (
                <li key={m} className="flex items-start gap-2.5">
                  <span className={`mt-[7px] size-1.5 shrink-0 rounded-full ${beta ? "bg-amber-500" : "bg-emerald-500"}`} />
                  <span>
                    {m}
                    {beta && <span className="ml-2 font-mono text-[10.5px] uppercase tracking-wider text-amber-600 dark:text-amber-400">beta</span>}
                  </span>
                </li>
              ))}
              {ROADMAP.map((r) => (
                <li key={r.name} className="flex items-start gap-2.5 text-muted">
                  <span className="mt-[7px] size-1.5 shrink-0 rounded-full border border-[var(--muted)]" />
                  <span>
                    {r.name} <span className="font-mono text-[10.5px] uppercase tracking-wider">soon</span>
                  </span>
                </li>
              ))}
            </ul>
            <a
              href="https://github.com/PramithaMJ/RouterDeck/issues/new?template=router_support.yml"
              target="_blank"
              rel="noopener"
              className="mt-5 inline-flex items-center gap-1.5 text-[13.5px] font-medium underline decoration-[var(--border)] underline-offset-4 hover:decoration-[var(--text)]"
            >
              <Plus className="size-3.5" /> Request your router
            </a>
          </div>

          <div id="faq">
            <p className="label-caps">Questions</p>
            <div className="mt-4 divide-y divide-[var(--border)] border-y border-subtle">
              {FAQ.map(([q, a]) => (
                <details key={q} className="group py-4">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[15.5px] font-medium tracking-[-0.01em]">
                    {q}
                    <Plus className="size-4 shrink-0 text-muted transition group-open:rotate-45" />
                  </summary>
                  <p className="mt-3 max-w-[64ch] text-[14.5px] leading-relaxed text-muted">{a}</p>
                </details>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <div className="bg-ink flex flex-col items-start justify-between gap-6 rounded-[18px] p-8 sm:flex-row sm:items-center sm:p-10">
          <div>
            <p className="text-[1.6rem] font-semibold leading-tight tracking-[-0.03em]">Ready when you are.</p>
            <p className="mt-1.5 text-[14.5px] opacity-70">Free, open source, and it never leaves your home network.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href="#connect" className="inline-flex h-11 items-center rounded-lg bg-[var(--on-ink)] px-5 text-[14.5px] font-medium text-[var(--ink)] transition hover:opacity-90">
              Connect my router
            </a>
            <a href="https://github.com/PramithaMJ/RouterDeck" target="_blank" rel="noopener" className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-white/20 px-5 text-[14.5px] font-medium transition hover:bg-white/10 dark:border-black/20 dark:hover:bg-black/5">
              View source <ArrowUpRight className="size-4" />
            </a>
          </div>
        </div>
      </section>

      <BuiltByFooter />
    </div>
  );
}
