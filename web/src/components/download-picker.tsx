"use client";

import { ArrowRight, Download } from "lucide-react";
import { useEffect, useState } from "react";
import { DESKTOP_APPS, detectPlatform, RELEASES_PAGE, type ConnectApp } from "@/lib/downloads";
import { cn } from "@/lib/cn";

const ORDER: ConnectApp[] = ["windows", "macArm", "macIntel", "linux"];

const FIRST_RUN: Record<ConnectApp, React.ReactNode> = {
  windows: (
    <>
      Run the installer. If Windows says <b>&quot;Windows protected your PC&quot;</b>, click <b>More info → Run anyway</b>. That only happens the first time, because the app isn&apos;t signed with a paid certificate yet.
    </>
  ),
  macArm: (
    <>
      Open the .dmg and drag RouterDeck into Applications. The first time, macOS may say it can&apos;t check the app: open <b>System Settings → Privacy &amp; Security</b>, scroll down and click <b>Open Anyway</b>. On older macOS, right-click the app → <b>Open</b>.
    </>
  ),
  macIntel: (
    <>
      Open the .dmg and drag RouterDeck into Applications. The first time, macOS may say it can&apos;t check the app: open <b>System Settings → Privacy &amp; Security</b>, scroll down and click <b>Open Anyway</b>. On older macOS, right-click the app → <b>Open</b>.
    </>
  ),
  linux: (
    <>
      AppImage: <span className="font-mono text-[12.5px]">chmod +x RouterDeck-Linux-x64.AppImage</span> then double-click it. Ubuntu/Debian: <span className="font-mono text-[12.5px]">sudo apt install ./RouterDeck-Linux-x64.deb</span>.
    </>
  ),
};

export function DownloadPicker() {
  const [platform, setPlatform] = useState<ConnectApp | null>(null);
  useEffect(() => {
    void detectPlatform().then(setPlatform);
  }, []);
  const main = DESKTOP_APPS[platform ?? "windows"];

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <a href={main.file} className={cn("bg-ink inline-flex h-12 items-center gap-2 rounded-lg px-6 text-[15px] font-medium transition", !platform && "opacity-0")}>
          <Download className="size-[18px]" /> Download for {main.label}
        </a>
        <span className="text-[13px] text-muted">Free and open source</span>
      </div>

      <ul className="mt-10 divide-y divide-[var(--border)] border-y border-subtle">
        {ORDER.map((k) => {
          const a = DESKTOP_APPS[k];
          return (
            <li key={k} className="grid gap-3 py-5 sm:grid-cols-[13rem_1fr_auto] sm:items-start sm:gap-6">
              <div>
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium">
                  {a.label}
                  {k === platform && <span className="whitespace-nowrap rounded bg-[var(--surface-2)] px-1.5 py-0.5 text-[11px] font-medium text-muted">This computer</span>}
                </p>
                <p className="text-[12.5px] text-muted">{a.kind}</p>
              </div>
              <p className="text-[13.5px] leading-relaxed text-muted">{FIRST_RUN[k]}</p>
              <div className="flex flex-col items-start gap-1.5 sm:items-end">
                <a href={a.file} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-subtle px-3.5 text-[13.5px] font-medium transition hover:border-[var(--text)]">
                  <Download className="size-3.5" /> Download
                </a>
                {a.alt && (
                  <a href={a.alt.file} className="text-[12.5px] text-muted underline underline-offset-2 hover:text-[var(--text)]">
                    {a.alt.label}
                  </a>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-4 text-[13px] text-muted">
        All files, checksums and release notes are on{" "}
        <a href={RELEASES_PAGE} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-[var(--text)] underline underline-offset-2">
          GitHub Releases <ArrowRight className="size-3" />
        </a>
      </p>
    </div>
  );
}
