import Link from "next/link";
import { cn } from "@/lib/cn";

export function LogoMark({ className }: { className?: string }) {
  // Ink tile, two signal arcs and the orange "live" dot. No gradients.
  return (
    <span aria-hidden className={cn("inline-flex size-8 shrink-0 items-center justify-center rounded-[28%] bg-ink", className)}>
      <svg viewBox="0 0 32 32" className="size-[72%]">
        <path d="M7.5 15.5a12 12 0 0 1 17 0M11.5 19.5a6.4 6.4 0 0 1 9 0" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
        <circle cx="16" cy="24" r="2.6" fill="#f2632a" />
      </svg>
    </span>
  );
}

export function Logo({ href = "/", className }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={cn("flex items-center gap-2.5", className)}>
      <LogoMark />
      <span className="text-[16px] font-semibold tracking-[-0.02em]">RouterDeck</span>
    </Link>
  );
}
