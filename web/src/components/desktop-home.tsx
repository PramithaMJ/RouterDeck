"use client";

import { useEffect, useState } from "react";
import { desktopBridge } from "@/lib/transport/desktop";
import { LogoMark } from "./brand";
import { ConnectCard } from "./connect-card";
import { ThemeToggle } from "./theme-toggle";
import { UpdateBanner } from "./update-banner";

/** Inside the desktop app, the home page is just a focused connect screen. */
export function DesktopHome() {
  const [desk, setDesk] = useState(false);
  useEffect(() => setDesk(!!desktopBridge()), []);
  if (!desk) return null;
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[var(--bg)]">
      <div className="mx-auto flex min-h-full max-w-md flex-col justify-center px-4 py-10">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <LogoMark />
            <span className="text-[16px] font-semibold tracking-[-0.02em]">RouterDeck</span>
          </div>
          <ThemeToggle />
        </div>
        <UpdateBanner className="mb-4" />
        <ConnectCard />
        <p className="mt-4 text-center text-[12px] text-muted">Your router password stays on this computer.</p>
      </div>
    </div>
  );
}
