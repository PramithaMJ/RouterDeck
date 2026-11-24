"use client";

import { Terminal } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { SITE_URL } from "@/lib/site";
import { CopyButton } from "./ui";

type Os = "mac" | "windows" | "linux";

const CMD: Record<Os, { label: string; where: string; cmd: string }> = {
  mac: { label: "macOS", where: "Open Terminal (⌘ Space → Terminal) and paste:", cmd: `curl -fsSL ${SITE_URL}/install.sh | bash` },
  windows: { label: "Windows", where: "Open PowerShell (Start → type PowerShell) and paste:", cmd: `irm ${SITE_URL}/install.ps1 | iex` },
  linux: { label: "Linux", where: "Open a terminal and paste:", cmd: `curl -fsSL ${SITE_URL}/install.sh | bash` },
};

function detectOs(): Os {
  if (typeof navigator === "undefined") return "windows";
  const ua = navigator.userAgent;
  if (/Windows/i.test(ua)) return "windows";
  if (/Mac OS X|Macintosh/i.test(ua)) return "mac";
  return "linux";
}

/**
 * One-line install. Files fetched by curl / PowerShell aren't marked as
 * "downloaded from the internet", so macOS and Windows don't show the
 * unsigned-app warning. The script checks the release's SHA-256 first.
 */
export function InstallCommand({ className }: { className?: string }) {
  const [os, setOs] = useState<Os>("windows");
  useEffect(() => setOs(detectOs()), []);
  const c = CMD[os];
  return (
    <div className={cn("rounded-[14px] border border-subtle bg-[var(--bg)] p-4 sm:p-5", className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-[14px] font-semibold">
          <Terminal className="size-4" /> Install with one command
          <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">No security warning</span>
        </p>
        <div className="inline-flex rounded-lg bg-[var(--surface-2)] p-0.5 text-[12.5px]" role="tablist">
          {(Object.keys(CMD) as Os[]).map((k) => (
            <button
              key={k}
              role="tab"
              aria-selected={os === k}
              onClick={() => setOs(k)}
              className={cn("rounded-md px-2.5 py-1 font-medium transition", os === k ? "surface shadow-[0_1px_2px_rgb(0_0_0/0.08)] ring-1 ring-[var(--border)]" : "text-muted hover:text-[var(--text)]")}
            >
              {CMD[k].label}
            </button>
          ))}
        </div>
      </div>
      <p className="mt-3 text-[12.5px] text-muted">{c.where}</p>
      <div className="mt-1.5 flex items-center gap-2 rounded-lg bg-[var(--surface-2)] py-2 pl-3 pr-1.5">
        <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono text-[12.5px]">{c.cmd}</code>
        <CopyButton value={c.cmd} />
      </div>
      <p className="mt-2 text-[12px] leading-relaxed text-muted">
        Downloads the latest release from GitHub, checks its checksum, installs it and opens it.{" "}
        <a href={`/install.${os === "windows" ? "ps1" : "sh"}`} target="_blank" className="underline underline-offset-2 hover:text-[var(--text)]">
          Read the script
        </a>
        .
      </p>
    </div>
  );
}
