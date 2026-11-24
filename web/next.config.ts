import type { NextConfig } from "next";
import path from "node:path";

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
};

export default nextConfig;
