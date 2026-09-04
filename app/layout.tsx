import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";

import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { publicEnv } from "@/lib/env";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(publicEnv.siteUrl),
  title: {
    default: "Bryt Vision Media — Find Your Highlights",
    template: "%s · Bryt Vision Media",
  },
  description:
    "Browse and buy individual sports highlight clips filmed by Bryt Vision Media. Watch a free preview, purchase the plays you want, and download them in high quality.",
  openGraph: {
    title: "Bryt Vision Media — Find Your Highlights",
    description:
      "Browse and buy individual sports highlight clips filmed by Bryt Vision Media.",
    siteName: "Bryt Vision Media",
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
    <html lang="en" className={`${geistSans.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
