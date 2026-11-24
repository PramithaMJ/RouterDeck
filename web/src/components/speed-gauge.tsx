"use client";

import { useEffect, useRef, useState } from "react";

/** Non-linear scale so both 3 Mbps and 900 Mbps lines are readable. */
const STOPS = [0, 1, 5, 10, 20, 30, 50, 75, 100, 250, 500, 1000];
const START = 135; // degrees, SVG coords (0 = +x, clockwise)
const SWEEP = 270;

function toFraction(v: number) {
  if (v <= 0) return 0;
  if (v >= STOPS[STOPS.length - 1]) return 1;
  const i = STOPS.findIndex((s) => s > v);
  const a = STOPS[i - 1], b = STOPS[i];
  return (i - 1 + (v - a) / (b - a)) / (STOPS.length - 1);
}

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arc(cx: number, cy: number, r: number, from: number, to: number) {
  const a = polar(cx, cy, r, from), b = polar(cx, cy, r, to);
  const large = to - from > 180 ? 1 : 0;
  return `M ${a.x} ${a.y} A ${r} ${r} 0 ${large} 1 ${b.x} ${b.y}`;
}

/** Critically-damped spring towards the target, for a smooth needle. */
function useSpring(target: number) {
  const [v, setV] = useState(target);
  const state = useRef({ x: target, vel: 0, target });
  state.current.target = target;
  useEffect(() => {
    let raf = 0, last = performance.now();
    const tick = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      const s = state.current;
      const k = 60, d = 2 * Math.sqrt(k);
      const acc = k * (s.target - s.x) - d * s.vel;
      s.vel += acc * dt;
      s.x += s.vel * dt;
      setV(s.x);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return v;
}

export function SpeedGauge({
  value,
  unit = "Mbps",
  label,
  tone = "brand",
  active,
  hideReadout,
}: {
  hideReadout?: boolean;
  value: number;
  unit?: string;
  label?: string;
  tone?: "brand" | "emerald" | "amber";
  active?: boolean;
}) {
  const frac = useSpring(toFraction(value));
  const cx = 160, cy = 160, r = 128;
  const angle = START + SWEEP * Math.max(0, Math.min(1, frac));
  const colors = {
    brand: ["#f7a072", "#e8551f"],
    emerald: ["#34d399", "#059669"],
    amber: ["#fbbf24", "#d97706"],
  }[tone];
  const needle = polar(cx, cy, r - 30, angle);
  const display = value >= 100 ? Math.round(value).toString() : value.toFixed(value >= 10 ? 1 : 2);

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[340px]">
      <svg viewBox="0 0 320 320" className="h-full w-full" role="img" aria-label={`${label ?? ""} ${display} ${unit}`}>
        <defs>
          <linearGradient id={`g-${tone}`} x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stopColor={colors[0]} />
            <stop offset="1" stopColor={colors[1]} />
          </linearGradient>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="6" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {/* track */}
        <path d={arc(cx, cy, r, START, START + SWEEP)} fill="none" stroke="var(--surface-2)" strokeWidth="18" strokeLinecap="round" />
        {/* value */}
        {frac > 0.002 && <path d={arc(cx, cy, r, START, angle)} fill="none" stroke={`url(#g-${tone})`} strokeWidth="18" strokeLinecap="round" filter={active ? "url(#glow)" : undefined} />}
        {/* ticks + labels */}
        {STOPS.map((s, i) => {
          const a = START + (SWEEP * i) / (STOPS.length - 1);
          const p1 = polar(cx, cy, r - 18, a), p2 = polar(cx, cy, r - 25, a), lp = polar(cx, cy, r - 40, a);
          return (
            <g key={s}>
              <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="var(--muted)" strokeOpacity="0.5" strokeWidth="2" strokeLinecap="round" />
              <text x={lp.x} y={lp.y} fill="var(--muted)" fontSize="11" textAnchor="middle" dominantBaseline="middle" className="tabular-nums">
                {s >= 1000 ? "1G" : s}
              </text>
            </g>
          );
        })}
        {/* needle */}
        <line x1={cx} y1={cy} x2={needle.x} y2={needle.y} stroke={colors[1]} strokeWidth="4" strokeLinecap="round" />
        <circle cx={cx} cy={cy} r="9" fill="var(--surface)" stroke={colors[1]} strokeWidth="4" />
      </svg>
      <div className={`pointer-events-none absolute inset-x-0 bottom-[15%] text-center transition-opacity ${hideReadout ? "opacity-0" : "opacity-100"}`}>
        <div className="text-[2.6rem] font-semibold leading-none tracking-tight tabular-nums sm:text-5xl">{display}</div>
        <div className="mt-1.5 text-sm font-medium text-muted">{unit}</div>
        {label && <div className="mt-2 text-[12px] font-semibold uppercase tracking-[0.14em]" style={{ color: colors[1] }}>{label}</div>}
      </div>
    </div>
  );
}

/** Live throughput sparkline (area). */
export function SpeedChart({ samples, tone }: { samples: number[]; tone: "brand" | "emerald" }) {
  const w = 600, h = 120;
  const max = Math.max(1, ...samples) * 1.15;
  const pts = samples.map((v, i) => [samples.length <= 1 ? 0 : (i / (samples.length - 1)) * w, h - (v / max) * (h - 8) - 4]);
  const line = pts.map((p, i) => `${i ? "L" : "M"} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  const area = pts.length ? `${line} L ${w} ${h} L 0 ${h} Z` : "";
  const c = tone === "brand" ? "#e8551f" : "#10b981";
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-24 w-full" aria-hidden>
      <defs>
        <linearGradient id={`area-${tone}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={c} stopOpacity="0.35" />
          <stop offset="1" stopColor={c} stopOpacity="0" />
        </linearGradient>
      </defs>
      {area && <path d={area} fill={`url(#area-${tone})`} />}
      {line && <path d={line} fill="none" stroke={c} strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />}
    </svg>
  );
}
