import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.RB_E2E === "1" ? ".next-e2e" : ".next",
  // Playwright drives the dev server over 127.0.0.1, which Next's dev-origin
  // allowlist otherwise blocks.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
