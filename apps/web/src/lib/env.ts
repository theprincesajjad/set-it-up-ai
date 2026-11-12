/**
 * Runtime configuration for the web app. Every value has a safe local default
 * so `pnpm dev` works with zero setup.
 *
 * - NEXT_PUBLIC_API_URL: public base URL of the API (browser + server). Default http://localhost:4000.
 * - API_INTERNAL_URL: optional server-only override (e.g. a private network address) used by
 *   server components / route handlers. Falls back to NEXT_PUBLIC_API_URL.
 * - NEXT_PUBLIC_SITE_URL: canonical URL of this site (sitemap, OG, metadataBase). Default http://localhost:3000; in production
 *   against a real API it must be set to the public https address (assertSiteUrlInProduction).
 * - NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: enables Stripe Elements. Without it the dev fake-payment path is shown.
 * - NEXT_PUBLIC_APP_STORE_URL / NEXT_PUBLIC_PLAY_STORE_URL: "Get the app" links, read in lib/marketing/store-links.ts. Unset (or just the store's home page): the buttons are hidden.
 * - NEXT_PUBLIC_WHATSAPP_NUMBER: the WhatsApp number behind the "Message us on WhatsApp" buttons, which open a chat with our own AI
 *   assistant (digits, international format; keep it equal to the API's SALES_AGENT_WHATSAPP_NUMBER). Read in
 *   lib/marketing/whatsapp.ts. Unset: the buttons are hidden.
 */
import { missingBrandConfig } from "@ll/shared";
const DEFAULT_API = "http://localhost:4000";

const trimSlash = (u: string) => u.replace(/\/+$/, "");

export const env = {
  apiUrl: trimSlash(process.env.NEXT_PUBLIC_API_URL || DEFAULT_API),
  siteUrl: trimSlash(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
  stripePublishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "",
  isProduction: process.env.NODE_ENV === "production",
} as const;

/** True for an address that only exists on this machine: the only place the dev sign-in code may be filled in for you. */
export function isLocalUrl(url: string): boolean {
  try {
    const h = new URL(url).hostname;
    return h === "localhost" || h === "127.0.0.1" || h === "[::1]" || h === "::1" || h.endsWith(".localhost");
  } catch {
    return false;
  }
}

/**
 * OTP_AUTOFILL=1 fills the sign-in code in for you (used by the end-to-end runs against a local API). On a real deployment it would hand
 * out login codes for any phone number, so a production server that points at a non-local API and has it set REFUSES TO RENDER, loudly.
 */
export function assertNoOtpAutofillInProduction(e: { NODE_ENV?: string; OTP_AUTOFILL?: string; NEXT_PUBLIC_API_URL?: string; API_INTERNAL_URL?: string } = process.env): void {
  if (e.NODE_ENV !== "production" || e.OTP_AUTOFILL !== "1") return;
  const api = e.API_INTERNAL_URL || e.NEXT_PUBLIC_API_URL || DEFAULT_API;
  if (!isLocalUrl(api)) throw new Error("OTP_AUTOFILL=1 is set on a production server that talks to a real API. Unset it: it would show sign-in codes to anyone.");
}
assertNoOtpAutofillInProduction();

/**
 * The support address and legal entity name are configuration (packages/shared brand.ts). A production server that talks to a real API
 * REFUSES TO BUILD OR RENDER without a real address and entity name. A local production build (the end-to-end runs) may keep the working values.
 */
export function assertBrandInProduction(e: Record<string, string | undefined> = process.env): void {
  if (e.NODE_ENV !== "production") return;
  if (isLocalUrl(e.NEXT_PUBLIC_API_URL || DEFAULT_API)) return;
  const problems = missingBrandConfig(e);
  if (problems.length) throw new Error(`Production is not launch-ready:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
}
assertBrandInProduction();

/**
 * NEXT_PUBLIC_SITE_URL feeds every canonical link, the sitemap, robots.txt and the share cards. Unset, it falls back to
 * http://localhost:3000, and a deployment would publish localhost links to search engines and chat previews. So a production server that
 * whose public API address is a real host REFUSES TO BUILD OR RENDER unless the site URL is an https address that is not this machine.
 * (A production build whose public API is on this machine, as the end-to-end runs and a local `docker compose up` make, may keep a local
 * http site URL.)
 */
export function assertSiteUrlInProduction(e: { NODE_ENV?: string; NEXT_PUBLIC_SITE_URL?: string; NEXT_PUBLIC_API_URL?: string } = process.env): void {
  if (e.NODE_ENV !== "production") return;
  // The public API address tells a real deployment from a local one (the server-side address may be a private network name either way).
  if (isLocalUrl(e.NEXT_PUBLIC_API_URL || DEFAULT_API)) return;
  const site = e.NEXT_PUBLIC_SITE_URL?.trim();
  if (!site) throw new Error("NEXT_PUBLIC_SITE_URL is not set on a production server. Set it to the site's public https address: canonical links, the sitemap and share cards are built from it.");
  let url: URL | null = null;
  try {
    url = new URL(site);
  } catch {
    /* reported below */
  }
  if (!url || url.protocol !== "https:" || isLocalUrl(site)) throw new Error(`NEXT_PUBLIC_SITE_URL must be the site's public https address in production (it is "${site}").`);
}
assertSiteUrlInProduction();

/** API base for server-side code (server components, route handlers, proxy). */
export function serverApiUrl(): string {
  return trimSlash(process.env.API_INTERNAL_URL || env.apiUrl);
}
