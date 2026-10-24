import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Inter } from "next/font/google";
import { BRAND } from "@ll/shared";
import { ToastProvider } from "@/components/ui/Toast";
import { env } from "@/lib/env";
import "./globals.css";

/** UI + body (docs/design/foundations.md "Type"). Variable names are what @ll/design-tokens/theme.css reads. */
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
/** Display numbers, headings and lowercase map / category labels. */
const bricolage = Bricolage_Grotesque({ subsets: ["latin"], axes: ["opsz", "wdth"], variable: "--font-bricolage", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(env.siteUrl),
  title: { default: `${BRAND.name} · ${BRAND.tagline}`, template: `%s · ${BRAND.name}` },
  description: "A free loyalty program for independent shops, shared with every shop on the street. Free forever, no fee on loyalty, unlimited locations.",
  applicationName: BRAND.name,
  openGraph: { siteName: BRAND.name, type: "website", locale: "en_CA" },
  twitter: { card: "summary_large_image" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FFFFFF" },
    { media: "(prefers-color-scheme: dark)", color: "#0B0B0C" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-CA" className={`${inter.variable} ${bricolage.variable}`}>
      <body className="bg-bg font-sans text-body text-fg antialiased">
        <a href="#main" className="sr-only z-toast rounded-full bg-fg px-4 py-2 text-meta-strong text-bg focus:not-sr-only focus:fixed focus:start-4 focus:top-4">
          Skip to content
        </a>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
