import type { DriverContext, DriverFactory, ProbeResult } from "../router/types";
import { RouterError } from "../router/types";
import type { Transport } from "../transport/types";
import { demoDriver } from "./demo";
import { huaweiHiLink } from "./huawei-hilink";
import { realtekBoa } from "./realtek-boa";
import { starlink } from "./starlink";
import { tozed } from "./tozed";
import { zteGoform } from "./zte-goform";

/**
 * Registry of supported router families. Add a new brand by implementing
 * DriverFactory (see docs/ADDING_A_ROUTER.md) and listing it here.
 */
export const DRIVERS: DriverFactory[] = [realtekBoa, huaweiHiLink, zteGoform, tozed, starlink];

/** Shown on the landing page so people know what's coming. */
export const ROADMAP = [
  { name: "Huawei EchoLife fiber (HG8145 / EG8145)", isps: "SLT-Mobitel, Dialog Fiber" },
  { name: "ZTE ZXHN fiber (F670L / F660)", isps: "SLT-Mobitel" },
  { name: "TP-Link Archer / Deco", isps: "Any ISP" },
];

export { demoDriver };

/** Where home routers usually live, most common first. */
export const COMMON_HOSTS = [
  "http://192.168.1.1",
  "http://192.168.8.1", // Huawei 4G (Dialog/Mobitel/Hutch)
  "http://192.168.0.1",
  "http://192.168.100.1", // Starlink dish, some ONTs
  "http://192.168.1.254",
  "http://10.0.0.1",
  "http://192.168.18.1",
  "http://192.168.10.1",
  "http://192.168.0.254",
  "http://192.168.2.1",
];

export interface DetectedRouter {
  factory: DriverFactory;
  probe: ProbeResult;
  baseUrl: string;
}

export async function detectRouter(ctx: DriverContext): Promise<DetectedRouter> {
  const home = await ctx.transport
    .request({ url: ctx.baseUrl + "/", timeoutMs: 6000 })
    .catch(() => ({ status: 0, url: ctx.baseUrl, headers: {} as Record<string, string>, body: "" }));
  const results = await Promise.all(
    DRIVERS.map(async (factory) => ({ factory, probe: await factory.probe(ctx, home).catch(() => null) })),
  );
  const best = results
    .filter((r): r is { factory: DriverFactory; probe: ProbeResult } => !!r.probe && r.probe.confidence > 0.25)
    .sort((a, b) => b.probe.confidence - a.probe.confidence)[0];
  if (!best) {
    if (home.status === 0) throw new RouterError(`Nothing answered at ${ctx.baseUrl}. Check the address and that you're on your home network.`, "unknown");
    const title = home.body.match(/<title>([^<]*)<\/title>/i)?.[1]?.trim();
    throw new RouterError(
      `Found a router at ${ctx.baseUrl}${title ? ` ("${title}")` : ""}, but this model isn't supported yet. You can still use its own page, or help add it.`,
      "unsupported",
    );
  }
  return { ...best, baseUrl: ctx.baseUrl };
}

/**
 * Finds the router automatically:
 *  1. the computer's default gateway (connector only, exact),
 *  2. otherwise whichever common address answers first (cheap no-cors probe),
 *  3. then asks each driver who it is.
 */
export async function autoDetect(transport: Transport, onStep?: (msg: string) => void): Promise<DetectedRouter[]> {
  onStep?.("Looking at your network…");
  const net = await transport.network?.().catch(() => ({})) ?? {};
  const gateway = "gateway" in net && net.gateway ? `http://${net.gateway}` : undefined;
  const extra = DRIVERS.flatMap((d) => d.candidateHosts ?? []);
  const candidates = [...new Set([...(gateway ? [gateway] : []), ...COMMON_HOSTS, ...extra])];
  onStep?.("Checking common router addresses…");
  const alive = transport.probe ? await transport.probe(candidates, 1500) : candidates.slice(0, 3);
  const ordered = candidates.filter((c) => alive.includes(c));
  const found: DetectedRouter[] = [];
  for (const baseUrl of ordered.slice(0, 4)) {
    onStep?.(`Identifying ${baseUrl.replace("http://", "")}…`);
    try {
      found.push(await detectRouter({ transport, baseUrl }));
    } catch {
      /* not supported / not a router */
    }
    if (found.length) break; // one router is the common case; avoids extra permission prompts
  }
  return found;
}
