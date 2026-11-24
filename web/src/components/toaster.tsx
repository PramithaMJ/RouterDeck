"use client";

import { CheckCircle2, Info, Loader2, XCircle } from "lucide-react";
import { useToasts } from "@/lib/toast";
import { cn } from "./ui";

export function Toaster() {
  const { items, dismiss } = useToasts();
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(76px+env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6 lg:items-end lg:pr-6" aria-live="polite">
      {items.map((t) => (
        <button
          key={t.id}
          onClick={() => dismiss(t.id)}
          className={cn(
            "pointer-events-auto flex w-full max-w-sm animate-slide-up items-start gap-3 rounded-2xl border px-4 py-3 text-left text-sm shadow-pop backdrop-blur",
            "border-subtle bg-[color-mix(in_oklch,var(--surface)_92%,transparent)]",
          )}
        >
          <span className="mt-0.5 shrink-0">
            {t.kind === "success" && <CheckCircle2 className="size-[18px] text-emerald-500" />}
            {t.kind === "error" && <XCircle className="size-[18px] text-rose-500" />}
            {t.kind === "info" && <Info className="size-[18px] text-brand-500" />}
            {t.kind === "loading" && <Loader2 className="size-[18px] animate-spin text-brand-500" />}
          </span>
          <span className="leading-snug">{t.message}</span>
        </button>
      ))}
    </div>
  );
}
