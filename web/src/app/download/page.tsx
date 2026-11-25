import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/brand";
import { BuiltByFooter } from "@/components/built-by";
import { DownloadPicker } from "@/components/download-picker";
import { InstallCommand } from "@/components/install-command";
import { ThemeToggle } from "@/components/theme-toggle";
import { CHROME_STORE_URL } from "@/lib/downloads";

export const metadata: Metadata = {
  alternates: { canonical: "/download/" },
  title: "Download the desktop app",
  description: "RouterDeck for Windows, macOS and Linux. Talks to your router directly, keeps running in the background so guest Wi-Fi passes end on time, and can share itself with your phones.",
};

const WHY: [string, string][] = [
  ["Nothing else to set up", "The app reaches your router by itself. No extension, no helper, no pairing code."],
  ["Guest passes end on time", "It can keep running in the menu bar or system tray, so a 2-hour guest password really stops after 2 hours."],
  ["Remembers your router login", "Saved in your computer's keychain, encrypted. Open the app and you're in."],
  ["Works for your phones too", "Turn on “Share with phones” and scan a QR code. Phones on your Wi-Fi get RouterDeck with nothing to install."],
];

export default function DownloadPage() {
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-4xl items-center justify-between px-4 py-5 sm:px-6">
        <Logo />
        <div className="flex items-center gap-1">
          <Link href="/" className="hidden rounded-lg px-3 py-2 text-[13.5px] text-muted transition hover:text-[var(--text)] sm:inline-flex">
            Use it in the browser instead
          </Link>
          <ThemeToggle />
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 pb-20 pt-6 sm:px-6">
        <p className="label-caps">Desktop app · Windows · macOS · Linux</p>
        <h1 className="mt-3 max-w-2xl text-[2.4rem] font-semibold leading-[1.08] tracking-[-0.035em] sm:text-[2.8rem]">RouterDeck, installed on your computer.</h1>
        <p className="mt-4 max-w-xl text-[16px] leading-relaxed text-muted">The same RouterDeck as the website, as a proper app. It updates itself from GitHub releases and never sends anything outside your home network.</p>

        <InstallCommand className="mt-8" />

        <section className="mt-6 rounded-[14px] border border-subtle p-4 text-[13.5px] leading-relaxed sm:p-5">
          <p className="font-semibold">Downloaded the file and see &quot;Not Opened&quot; or &quot;Windows protected your PC&quot;?</p>
          <p className="mt-1 text-muted">
            That&apos;s because RouterDeck isn&apos;t signed with a paid Apple / Microsoft certificate yet, not because anything is wrong with it. The command above avoids it. Or:
          </p>
          <ul className="mt-2 space-y-1.5 text-muted">
            <li>
              <b className="text-[var(--text)]">Mac:</b> click <b>Done</b>, then open <b>System Settings → Privacy &amp; Security</b>, scroll down to &quot;RouterDeck was blocked&quot; and click <b>Open Anyway</b>. Or in Terminal:{" "}
              <code className="rounded bg-[var(--surface-2)] px-1 font-mono text-[12px]">xattr -dr com.apple.quarantine /Applications/RouterDeck.app</code>
            </li>
            <li>
              <b className="text-[var(--text)]">Windows:</b> click <b>More info</b>, then <b>Run anyway</b>.
            </li>
          </ul>
          <p className="mt-2 text-muted">You only do this once. Updates install inside the app without it.</p>
        </section>

        <div className="mt-10">
          <p className="label-caps mb-4">Or download the installer</p>
          <DownloadPicker />
        </div>

        <section className="mt-14 grid gap-x-10 gap-y-7 sm:grid-cols-2">
          {WHY.map(([t, d]) => (
            <div key={t}>
              <h2 className="text-[15px] font-semibold">{t}</h2>
              <p className="mt-1 text-[14px] leading-relaxed text-muted">{d}</p>
            </div>
          ))}
        </section>

        <p className="mt-14 text-[13.5px] text-muted">
          Can&apos;t install apps on this computer? RouterDeck also works with no install from{" "}
          <Link href="/#connect" className="text-[var(--text)] underline underline-offset-2">
            the website
          </Link>{" "}
          using the router page button, the{" "}
          <a href={CHROME_STORE_URL} target="_blank" rel="noopener" className="text-[var(--text)] underline underline-offset-2">
            Chrome extension
          </a>{" "}
          or a one-line terminal command.
        </p>
      </main>
      <BuiltByFooter />
    </div>
  );
}
