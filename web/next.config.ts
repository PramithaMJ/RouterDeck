import type { NextConfig } from "next";
import { readFileSync } from "node:fs";
import path from "node:path";

// Version of the desktop app, shown next to the download buttons.
function desktopVersion() {
  try {
    return JSON.parse(readFileSync(path.resolve(__dirname, "../desktop/package.json"), "utf8")).version as string;
  } catch {
    return "";
  }
}

/**
 * Fully static build (no server). Deployed to Cloudflare Pages for free.
 * There is intentionally no backend: a cloud server can't reach a home
 * router, so all router traffic goes browser → extension/connector → router.
 */
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
  turbopack: { root: path.resolve(__dirname) },
  env: { NEXT_PUBLIC_DESKTOP_VERSION: desktopVersion() },
};

export default nextConfig;
