// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  // opzionale se vuoi sbloccare anche errori TS in build:
  // typescript: { ignoreBuildErrors: true },
};

export default nextConfig;
