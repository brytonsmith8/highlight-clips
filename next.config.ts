import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Admin clip uploads (original video) go through a Server Action.
    // Default Server Action body limit is 1 MB.
    serverActions: {
      bodySizeLimit: "50mb",
    },
  },
};

export default nextConfig;
