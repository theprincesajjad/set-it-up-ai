import type { Metadata, Viewport } from "next";
import { Figtree, Fraunces } from "next/font/google";
import { BRAND } from "@ll/shared";
import { ToastProvider } from "@/components/ui/Toast";
import { env } from "@/lib/env";
import "./globals.css";

const figtree = Figtree({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-figtree", display: "swap" });
const fraunces = Fraunces({ subsets: ["latin"], axes: ["SOFT", "opsz"], variable: "--font-fraunces", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(env.siteUrl),
  title: { default: `${BRAND.name} · ${BRAND.tagline}`, template: `%s · ${BRAND.name}` },
  description: "A free loyalty program for independent shops, shared with every shop on the street. Free forever, no transaction fees, unlimited locations.",
  applicationName: BRAND.name,
  openGraph: { siteName: BRAND.name, type: "website", locale: "en_CA" },
  twitter: { card: "summary_large_image" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FAF6EF" },
    { media: "(prefers-color-scheme: dark)", color: "#16130F" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-CA" className={`${figtree.variable} ${fraunces.variable}`}>
      <body className="bg-canvas font-sans text-body text-fg antialiased">
        <a href="#main" className="sr-only z-toast rounded-md bg-surface px-4 py-2 text-label text-fg focus:not-sr-only focus:fixed focus:start-4 focus:top-4">
          Skip to content
        </a>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
