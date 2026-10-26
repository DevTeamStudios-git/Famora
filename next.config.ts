import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.FAMORA_E2E === "1" ? ".next-e2e" : ".next",
  experimental: { serverActions: { bodySizeLimit: "11mb" } },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.supabase.co",
      },
    ],
  },
  // Prisma driver adapters run on Node — keep them out of the client bundle.
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg", "pg"],
};

export default nextConfig;
