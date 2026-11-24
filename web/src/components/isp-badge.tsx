"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { ispById, ispLogoUrl, type IspBrand } from "@/lib/isp";

/** Provider logo tile: the ISP's own favicon on a white tile, initials as fallback. */
export function IspLogo({ isp, size = "md", className }: { isp: IspBrand; size?: "sm" | "md" | "lg"; className?: string }) {
  const [failed, setFailed] = useState(false);
  const box = { sm: "size-6 rounded-md", md: "size-9 rounded-xl", lg: "size-12 rounded-2xl" }[size];
  const img = { sm: "size-4", md: "size-6", lg: "size-8" }[size];
  return (
    <span className={cn("inline-flex shrink-0 items-center justify-center bg-white ring-1 ring-black/5 shadow-sm", box, className)} title={isp.name}>
      {failed ? (
        <span className="text-[11px] font-bold" style={{ color: isp.color }}>
          {isp.short.slice(0, 2).toUpperCase()}
        </span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={ispLogoUrl(isp)} alt="" className={cn("object-contain", img)} referrerPolicy="no-referrer" loading="lazy" onError={() => setFailed(true)} />
      )}
    </span>
  );
}

export function IspBadge({ id, className, size = "md" }: { id?: string; className?: string; size?: "sm" | "md" }) {
  const isp = ispById(id);
  if (!isp) return null;
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 rounded-full py-0.5 pl-0.5 pr-2.5 text-[12px] font-semibold", size === "sm" && "text-[11px]", className)}
      style={{ backgroundColor: `color-mix(in oklch, ${isp.color} 12%, transparent)`, color: `color-mix(in oklch, ${isp.color} 80%, var(--text))` }}
    >
      <IspLogo isp={isp} size="sm" className="rounded-full" />
      {isp.name}
    </span>
  );
}
