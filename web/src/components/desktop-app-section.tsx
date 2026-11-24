"use client";

import { ArrowRight, Check, Download, Laptop, Minus, Monitor, SquareTerminal } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { DESKTOP_APPS, detectPlatform, RELEASES_PAGE, type ConnectApp } from "@/lib/downloads";

export const DESKTOP_VERSION = process.env.NEXT_PUBLIC_DESKTOP_VERSION || "";

function usePlatform() {
  const [p, setP] = useState<ConnectApp | null>(null);
  useEffect(() => {
    void detectPlatform().then(setP);
  }, []);
  return p;
}

const isPhone = () => typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

/** Hero call-to-action: one button for this computer, then the other systems. */
export function HeroDownload() {
  const platform = usePlatform();
  const [phone, setPhone] = useState(false);
  useEffect(() => setPhone(isPhone()), []);
  const app = DESKTOP_APPS[platform ?? "windows"];
  return (
    <div className="mt-8">
      <div className="flex flex-wrap items-center gap-3">
        {phone ? (
          <Link href="/download/" className="bg-ink inline-flex h-12 items-center gap-2 rounded-lg px-5 text-[15px] font-medium">
            <Download className="size-[18px]" /> Desktop app for Windows, Mac &amp; Linux
          </Link>
        ) : (
          <a href={app.file} className={cn("bg-ink inline-flex h-12 items-center gap-2 rounded-lg px-5 text-[15px] font-medium transition", !platform && "invisible")}>
            <Download className="size-[18px]" /> Download for {app.label}
          </a>
        )}
        <a href="#connect" className="inline-flex h-12 items-center gap-1.5 rounded-lg border border-subtle px-5 text-[15px] font-medium transition hover:border-[var(--text)]">
          Use in the browser
        </a>
      </div>
      <p className="mt-3 text-[13px] text-muted">
        Free desktop app for{" "}
        <a href="#desktop-app" className="text-[var(--text)] underline decoration-[var(--border)] underline-offset-4 hover:decoration-[var(--text)]">
          Windows, macOS and Linux
        </a>
        {DESKTOP_VERSION && <span className="font-mono text-[12px]"> · v{DESKTOP_VERSION}</span>}. Or no install at all, right in your browser.
      </p>
    </div>
  );
}

const COMPARE: [string, boolean, boolean][] = [
  ["Devices, blocking, Wi-Fi, guest passes, speed test", true, true],
  ["Every router setting (Advanced view)", true, true],
  ["Nothing to install", false, true],
  ["Connects by itself: no bookmark, extension or helper", true, false],
  ["Guest passes end on time, even with the window closed", true, false],
  ["Remembers your router login (in the system keychain)", true, false],
  ["Shares itself to phones on your Wi-Fi with a QR code", true, false],
  ["Runs in the menu bar / system tray, starts with your computer", true, false],
];

type Card = { key: string; name: string; icon: typeof Monitor; req: string; links: { label: string; file: string; primary?: boolean }[] };

const CARDS: Card[] = [
  {
    key: "windows",
    name: "Windows",
    icon: Monitor,
    req: "Windows 10 or 11 · 64-bit",
    links: [{ label: "Installer (.exe)", file: DESKTOP_APPS.windows.file, primary: true }],
  },
  {
    key: "mac",
    name: "macOS",
    icon: Laptop,
    req: "macOS 12 or newer",
    links: [
      { label: "Apple Silicon (M1 and newer)", file: DESKTOP_APPS.macArm.file, primary: true },
      { label: "Intel Mac", file: DESKTOP_APPS.macIntel.file },
    ],
  },
  {
    key: "linux",
    name: "Linux",
    icon: SquareTerminal,
    req: "64-bit · Ubuntu, Debian, Fedora…",
    links: [
      { label: "AppImage (any distro)", file: DESKTOP_APPS.linux.file, primary: true },
      { label: ".deb (Ubuntu / Debian)", file: DESKTOP_APPS.linux.alt!.file },
    ],
  },
];

/** Landing page section: the desktop app, download links for all three systems, and what it adds. */
export function DesktopAppSection() {
  const platform = usePlatform();
  const mine = platform === "macArm" || platform === "macIntel" ? "mac" : platform;

  return (
    <section id="desktop-app" className="scroll-mt-6 border-y border-subtle bg-[var(--surface)]">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="grid gap-12 lg:grid-cols-[1fr_2fr]">
          <div>
            <p className="label-caps">Desktop app</p>
            <h2 className="mt-3 text-[1.9rem] font-semibold leading-tight tracking-[-0.03em]">The full RouterDeck, installed on your computer.</h2>
            <p className="mt-4 max-w-[40ch] text-[14.5px] leading-relaxed text-muted">
              Everything in the website plus the things a browser tab can&apos;t do. Install it once, open it, sign in. It updates itself.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-muted">
              {DESKTOP_VERSION && <span className="font-mono">Version {DESKTOP_VERSION}</span>}
              <span>Free · open source · MIT</span>
            </div>
            <div className="mt-6 flex flex-col items-start gap-2 text-[13.5px]">
              <Link href="/download/" className="inline-flex items-center gap-1.5 font-medium underline decoration-[var(--border)] underline-offset-4 hover:decoration-[var(--text)]">
                Install steps for each system <ArrowRight className="size-3.5" />
              </Link>
              <a href={RELEASES_PAGE} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 text-muted underline decoration-[var(--border)] underline-offset-4 hover:text-[var(--text)]">
                All downloads, release notes and checksums <ArrowRight className="size-3.5" />
              </a>
            </div>
          </div>

          <div>
            <div className="grid gap-3 sm:grid-cols-3">
              {CARDS.map((c) => (
                <div key={c.key} className={cn("flex flex-col rounded-[14px] border bg-[var(--bg)] p-5", c.key === mine ? "border-[var(--text)]" : "border-subtle")}>
                  <div className="flex items-center justify-between">
                    <c.icon className="size-6" strokeWidth={1.6} />
                    {c.key === mine && <span className="rounded bg-[var(--surface-2)] px-1.5 py-0.5 text-[11px] font-medium text-muted">Your computer</span>}
                  </div>
                  <p className="mt-4 text-[16px] font-semibold tracking-[-0.01em]">{c.name}</p>
                  <p className="text-[12.5px] text-muted">{c.req}</p>
                  <div className="mt-5 flex flex-1 flex-col justify-end gap-2">
                    {c.links.map((l) => (
                      <a
                        key={l.file}
                        href={l.file}
                        className={cn(
                          "inline-flex min-h-10 items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-medium leading-tight transition",
                          l.primary ? "bg-ink" : "border border-subtle hover:border-[var(--text)]",
                        )}
                      >
                        <Download className="size-3.5 shrink-0" /> {l.label}
                      </a>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-8 overflow-hidden rounded-[14px] border border-subtle bg-[var(--bg)]">
              <table className="w-full text-[13.5px]">
                <thead>
                  <tr className="border-b border-subtle text-left">
                    <th className="px-4 py-3 font-medium text-muted">What you get</th>
                    <th className="w-24 px-2 py-3 text-center font-semibold sm:w-32">App</th>
                    <th className="w-24 px-2 py-3 text-center font-medium text-muted sm:w-32">Browser</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {COMPARE.map(([t, app, web]) => (
                    <tr key={t}>
                      <td className="px-4 py-2.5">{t}</td>
                      <td className="px-2 py-2.5 text-center">{app ? <Check className="mx-auto size-4 text-emerald-600 dark:text-emerald-400" aria-label="Yes" /> : <Minus className="mx-auto size-4 text-muted" aria-label="No" />}</td>
                      <td className="px-2 py-2.5 text-center">{web ? <Check className="mx-auto size-4 text-emerald-600 dark:text-emerald-400" aria-label="Yes" /> : <Minus className="mx-auto size-4 text-muted" aria-label="No" />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-[12.5px] leading-relaxed text-muted">
              First launch only: Windows may show &quot;Windows protected your PC&quot; (click More info → Run anyway). macOS may ask in System Settings → Privacy &amp; Security → Open Anyway. That&apos;s because the app isn&apos;t signed with a paid certificate yet.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
