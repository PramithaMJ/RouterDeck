import { Camera, CircleHelp, Cpu, Gamepad2, Laptop, Monitor, Smartphone, Speaker, Tablet, Tv } from "lucide-react";
import type { DeviceKind } from "@/lib/devices";
import { cn } from "@/lib/cn";

const ICONS: Record<DeviceKind, typeof Smartphone> = {
  phone: Smartphone,
  laptop: Laptop,
  desktop: Monitor,
  tv: Tv,
  tablet: Tablet,
  console: Gamepad2,
  speaker: Speaker,
  camera: Camera,
  iot: Cpu,
  unknown: CircleHelp,
};

export function DeviceIcon({ kind, blocked, className }: { kind: DeviceKind; blocked?: boolean; className?: string }) {
  const Icon = ICONS[kind];
  return (
    <div
      className={cn(
        "flex size-11 shrink-0 items-center justify-center rounded-2xl",
        blocked ? "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-300" : "bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-200",
        className,
      )}
    >
      <Icon className="size-5" />
    </div>
  );
}
