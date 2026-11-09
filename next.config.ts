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
  /* Order pages carry a private link token in the address (the Checkout Session id for now). Never send that
     address to any other website: no Referer header at all from these pages. Only these two paths. */
  async headers() {
    const noReferrer = [{ key: "Referrer-Policy", value: "no-referrer" }];
    return [
      { source: "/order/:path*", headers: noReferrer },
      { source: "/merch/thanks", headers: noReferrer },
    ];
  },
  /* Clip files upload directly from the browser to Supabase Storage
     (signed upload URLs), so no large body passes through a Server Action. */
};

export default nextConfig;
