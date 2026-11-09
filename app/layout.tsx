import type { Metadata, Viewport } from "next";
import { Barlow_Condensed, Geist } from "next/font/google";

import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { publicEnv } from "@/lib/env";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

// Condensed display face for the wordmark and headings.
const barlowCondensed = Barlow_Condensed({
  variable: "--font-barlow-condensed",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
});

export const metadata: Metadata = {
  metadataBase: new URL(publicEnv.siteUrl),
  title: {
    default: "BRYT VISION — All For The Glory Of God",
    template: "%s · BRYT VISION",
  },
  description:
    "Browse and buy individual sports highlight clips filmed by BRYT VISION. Watch a free preview, purchase the plays you want, and download them in high quality. Shop BRYT VISION compression shirts.",
  openGraph: {
    title: "BRYT VISION — All For The Glory Of God",
    description:
      "Sports highlight clips and apparel from BRYT VISION.",
    siteName: "BRYT VISION",
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0a0a0a",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${barlowCondensed.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
