"use client";

import { ArrowDownToLine, RefreshCw, RotateCw, X } from "lucide-react";
import { useEffect, useState } from "react";
import { create } from "zustand";
import { desktopBridge, type UpdateState } from "@/lib/transport/desktop";
import { cn } from "./ui";

/** Live update state from the desktop app (shared by the banner and Settings). */
export const useUpdate = create<{ state: UpdateState | null; set(s: UpdateState): void }>((set) => ({ state: null, set: (state) => set({ state }) }));

let wired = false;
function wire() {
  const b = desktopBridge();
  if (wired || !b?.updates) return;
  wired = true;
  b.updates.onChange((s) => useUpdate.getState().set(s));
  void b.updates.state().then((s) => useUpdate.getState().set(s));
}

export function useUpdateState() {
  useEffect(wire, []);
  return useUpdate((s) => s.state);
}

/**
 * Desktop app only: a slim bar when a new version exists. One click updates
 * (Windows / Linux AppImage replace themselves; macOS and .deb download the
 * installer and open it).
 */
export function UpdateBanner({ className }: { className?: string }) {
  const u = useUpdateState();
  const [hidden, setHidden] = useState<string | null>(null);
  const bridge = desktopBridge();
  if (!bridge?.updates || !u) return null;
  const show = u.status === "available" || u.status === "downloading" || u.status === "ready" || (u.status === "error" && !!u.version);
  if (!show || hidden === `${u.status}:${u.version}`) return null;

  const v = u.version ? `RouterDeck ${u.version}` : "A new version";
  let text: React.ReactNode;
  let action: React.ReactNode = null;
  const btn = "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-[var(--on-ink)] px-3 text-[13px] font-medium text-[var(--ink)] transition hover:opacity-90";

  if (u.status === "available") {
    text = (
      <>
        <b className="font-semibold">{v}</b> is available. You have {u.current}.
      </>
    );
    action = (
      <button className={btn} onClick={() => void bridge.updates!.download()}>
        <ArrowDownToLine className="size-3.5" /> {u.inPlace ? "Update now" : "Download update"}
      </button>
    );
  } else if (u.status === "downloading") {
    text = (
      <span className="flex w-full items-center gap-3">
        <span className="shrink-0">
          Downloading <b className="font-semibold">{v}</b>… {u.percent ?? 0}%
        </span>
        <span className="h-1 min-w-16 flex-1 overflow-hidden rounded-full bg-white/20 dark:bg-black/20">
          <span className="block h-full rounded-full bg-[var(--on-ink)] transition-[width]" style={{ width: `${u.percent ?? 0}%` }} />
        </span>
      </span>
    );
  } else if (u.status === "ready") {
    text = u.inPlace ? (
      <>
        <b className="font-semibold">{v}</b> is ready. Restart RouterDeck to finish updating.
      </>
    ) : (
      <>
        <b className="font-semibold">{v}</b> downloaded. In the window that opened, drag RouterDeck into Applications (replace the old one), then reopen it.
      </>
    );
    action = (
      <button className={btn} onClick={() => void bridge.updates!.install()}>
        {u.inPlace ? <RotateCw className="size-3.5" /> : <ArrowDownToLine className="size-3.5" />} {u.inPlace ? "Restart to update" : "Open installer"}
      </button>
    );
  } else {
    text = <>Couldn&apos;t download {v}. Check your internet connection.</>;
    action = (
      <button className={btn} onClick={() => void bridge.updates!.download()}>
        <RefreshCw className="size-3.5" /> Try again
      </button>
    );
  }

  return (
    <div className={cn("bg-ink flex items-center gap-3 rounded-xl px-4 py-2.5 text-[13.5px] shadow-card", className)} role="status">
      <div className="min-w-0 flex-1">{text}</div>
      {action}
      {u.status !== "downloading" && (
        <button className="shrink-0 rounded-md p-1 opacity-60 transition hover:opacity-100" onClick={() => setHidden(`${u.status}:${u.version}`)} aria-label="Hide">
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}
