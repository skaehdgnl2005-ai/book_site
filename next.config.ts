import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    // Child-photo uploads flow through server actions; the default 1MB cap rejects real photos.
    // QR video is collected backstage (option B), not uploaded — so this need only fit photos.
    serverActions: { bodySizeLimit: "25mb" },
  },
};

export default nextConfig;
