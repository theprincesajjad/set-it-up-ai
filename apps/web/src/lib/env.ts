/**
 * Runtime configuration for the web app. Every value has a safe local default
 * so `pnpm dev` works with zero setup.
 *
 * - NEXT_PUBLIC_API_URL: public base URL of the API (browser + server). Default http://localhost:4000.
 * - API_INTERNAL_URL: optional server-only override (e.g. a private network address) used by
 *   server components / route handlers. Falls back to NEXT_PUBLIC_API_URL.
 * - NEXT_PUBLIC_SITE_URL: canonical URL of this site (sitemap, OG, metadataBase). Default http://localhost:3000.
 * - NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: enables Stripe Elements. Without it the dev fake-payment path is shown.
 * - NEXT_PUBLIC_APP_STORE_URL / NEXT_PUBLIC_PLAY_STORE_URL: "Get the app" links.
 * - NEXT_PUBLIC_WHATSAPP_NUMBER: the WhatsApp number behind the "Message us on WhatsApp" buttons, which open a chat with our own AI
 *   assistant (digits, international format; keep it equal to the API's SALES_AGENT_WHATSAPP_NUMBER). Read in
 *   lib/marketing/whatsapp.ts. Unset: the buttons are hidden.
 */
const DEFAULT_API = "http://localhost:4000";

const trimSlash = (u: string) => u.replace(/\/+$/, "");

export const env = {
  apiUrl: trimSlash(process.env.NEXT_PUBLIC_API_URL || DEFAULT_API),
  siteUrl: trimSlash(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
  stripePublishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "",
  appStoreUrl: process.env.NEXT_PUBLIC_APP_STORE_URL || "https://apps.apple.com/",
  playStoreUrl: process.env.NEXT_PUBLIC_PLAY_STORE_URL || "https://play.google.com/store",
  isProduction: process.env.NODE_ENV === "production",
} as const;

/** API base for server-side code (server components, route handlers, proxy). */
export function serverApiUrl(): string {
  return trimSlash(process.env.API_INTERNAL_URL || env.apiUrl);
}
