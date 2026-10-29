import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Fraunces, Inter, Noto_Naskh_Arabic, Noto_Nastaliq_Urdu, Noto_Sans_Devanagari, Noto_Sans_Gurmukhi } from "next/font/google";
import { clear } from "@ll/design-tokens";
import { BRAND } from "@ll/shared";
import { ToastProvider } from "@/components/ui/Toast";
import { env } from "@/lib/env";
import { themeInitScript } from "@/lib/theme";
import "./globals.css";

/** UI + body. The opsz axis gives Clear its display cut on titles (font-optical-sizing: auto); Warm reads the same file. */
/** UI + body (docs/design/foundations.md "Type"). Variable names are what @ll/design-tokens/theme.css reads. */
const inter = Inter({ subsets: ["latin"], axes: ["opsz"], variable: "--font-inter", display: "swap" });
/**
 * Page titles, card titles and big numbers (Main Street Warm). Variable weight, so 600 and 800 are one file; Latin only, hi/ur/pa headings fall to the Noto faces below.
 * Warm only: Clear (the default) sets font-display to Inter, so these are not preloaded; a Warm page fetches them when it draws them.
 * Preloading them cost every Clear page about 250 KB on the critical path (landing v2 perf pass).
 */
const fraunces = Fraunces({ subsets: ["latin", "latin-ext"], axes: ["opsz"], variable: "--font-fraunces", display: "swap", preload: false });
/** The wordmark only (font-wordmark), Warm only like Fraunces. */
const bricolage = Bricolage_Grotesque({ subsets: ["latin"], axes: ["opsz", "wdth"], variable: "--font-bricolage", display: "swap", preload: false });

/**
 * Hindi, Urdu and Punjabi (packages/shared locales.ts `fonts`). Only the CSS variables are set here, on <html>; a face downloads when a glyph of its
 * script is drawn (`preload: false`, unicode-range subsets), so an English visitor fetches none of them. globals.css picks the stack by `[lang]`.
 */
const notoDeva = Noto_Sans_Devanagari({ subsets: ["devanagari"], variable: "--font-noto-deva", display: "swap", preload: false });
const notoGuru = Noto_Sans_Gurmukhi({ subsets: ["gurmukhi"], variable: "--font-noto-guru", display: "swap", preload: false });
const notoNastaliq = Noto_Nastaliq_Urdu({ subsets: ["arabic"], variable: "--font-noto-nastaliq", display: "swap", preload: false });
/** Covers the Arabic-script glyphs Nastaliq lacks (second in the Urdu stack). */
const notoNaskh = Noto_Naskh_Arabic({ subsets: ["arabic"], variable: "--font-noto-naskh", display: "swap", preload: false });

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
  // Clear is the default and light only (docs/design/v3.2-clear-build.md): the Clear canvas.
  themeColor: clear.canvas,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // data-theme-style / data-theme: Clear light by default; the head script (and <ThemeStyle> in a shop's layout) corrects them before paint.
    <html lang="en-CA" data-theme-style="clear" data-theme="light" suppressHydrationWarning className={`${inter.variable} ${fraunces.variable} ${bricolage.variable} ${notoDeva.variable} ${notoGuru.variable} ${notoNastaliq.variable} ${notoNaskh.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="bg-bg font-sans text-body text-fg antialiased">
        <a href="#main" className="sr-only z-toast rounded-full bg-fg px-4 py-2 text-meta-strong text-bg focus:not-sr-only focus:fixed focus:start-4 focus:top-4">
          Skip to content
        </a>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
