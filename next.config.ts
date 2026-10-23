import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Preview generation runs FFmpeg (the @ffmpeg-installer/ffmpeg program) in a server route. Keep that package
  // out of the bundle and make sure its program file and the watermark logo ship with the route.
  serverExternalPackages: ["@ffmpeg-installer/ffmpeg"],
  outputFileTracingIncludes: {
    "/api/admin/clips/preview": [
      "./node_modules/@ffmpeg-installer/**/*",
      "./public/brand/bryt-vision-logo.png",
    ],
  },
  /* Clip files upload directly from the browser to Supabase Storage
     (signed upload URLs), so no large body passes through a Server Action. */
};

export default nextConfig;
