import Link from "next/link";
import { cn } from "@/lib/cn";

export function LogoMark({ className }: { className?: string }) {
  // CSS gradient (not an SVG <defs> id) so several logos can coexist on a page.
  return (
    <span aria-hidden className={cn("inline-flex size-8 shrink-0 items-center justify-center rounded-[25%] bg-gradient-to-br from-[#7473f8] to-[#4338ca] shadow-sm shadow-brand-600/30", className)}>
      <svg viewBox="0 0 64 64" className="size-full">
        <path d="M18 27a20 20 0 0 1 28 0M23 33a12.5 12.5 0 0 1 18 0" fill="none" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" />
        <rect x="17" y="39" width="30" height="10" rx="5" fill="#fff" />
        <circle cx="24" cy="44" r="2" fill="#4f46e5" />
      </svg>
    </span>
  );
}

export function Logo({ href = "/", className }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={cn("flex items-center gap-2.5", className)}>
      <LogoMark />
      <span className="text-[17px] font-semibold tracking-tight">RouterDeck</span>
    </Link>
  );
}
