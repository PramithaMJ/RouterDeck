/**
 * GPON receive power guidance (ITU-T G.984 class B+ ≈ -8 … -27 dBm).
 */
export function fiberQuality(rx?: number): { label: string; tone: "green" | "amber" | "red"; percent: number; advice: string } | null {
  if (rx === undefined || !Number.isFinite(rx)) return null;
  const percent = Math.round(Math.max(0, Math.min(100, ((rx + 30) / 22) * 100)));
  if (rx > -8) return { label: "Too strong", tone: "amber", percent: 100, advice: "Signal is unusually high. Rare, but your ISP may need to add an attenuator." };
  if (rx >= -20) return { label: "Excellent", tone: "green", percent, advice: "Your fiber line is in great shape." };
  if (rx >= -24) return { label: "Good", tone: "green", percent, advice: "Healthy fiber signal." };
  if (rx >= -27) return { label: "Weak", tone: "amber", percent, advice: "Signal is on the low side. Check for sharp bends in the fiber cable; if you see drops, report it to your ISP." };
  return { label: "Poor", tone: "red", percent, advice: "Signal is too low and may cause disconnections. Contact your ISP and mention the Rx power value." };
}
