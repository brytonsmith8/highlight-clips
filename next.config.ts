import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* Clip files upload directly from the browser to Supabase Storage
     (signed upload URLs), so no large body passes through a Server Action. */
};

export default nextConfig;
