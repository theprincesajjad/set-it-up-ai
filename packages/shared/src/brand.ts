/**
 * Single source of truth for the product name and the business facts a customer can act on (support address, legal entity).
 *
 * The support address and the legal entity name are CONFIGURATION, not code: set NEXT_PUBLIC_SUPPORT_EMAIL and
 * NEXT_PUBLIC_LEGAL_ENTITY_NAME (SUPPORT_EMAIL and LEGAL_ENTITY_NAME work for the API alone). The literal `process.env.NEXT_PUBLIC_*`
 * reads below are what let the web build inline them. The working values here are for development and tests only: in production they
 * are empty when unset, and `missingBrandConfig` (called by the API at boot and by the web server) refuses to run without them.
 */
const DEV_SUPPORT_EMAIL = "hello@localloyalty.example";
const DEV_LEGAL_NAME = "Local Loyalty";

const hasProcess = typeof process !== "undefined";
// A production build whose public API is on this machine (the end-to-end runs, a local `docker compose up`) keeps the working values, as the
// web's launch guard allows (apps/web/src/lib/env.ts). Only a real deployment goes without them, and that refuses to boot until they are set.
const localApi = (() => {
  if (!hasProcess) return false;
  try {
    const h = new URL(process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000").hostname;
    return h === "localhost" || h === "127.0.0.1" || h === "[::1]" || h.endsWith(".localhost");
  } catch {
    return false;
  }
})();
const isProduction = hasProcess && process.env.NODE_ENV === "production" && !localApi;
const fromEnv = (value: string | undefined): string => (value ?? "").trim();

const supportEmail = hasProcess ? fromEnv(process.env.NEXT_PUBLIC_SUPPORT_EMAIL) || fromEnv(process.env.SUPPORT_EMAIL) : "";
const legalName = hasProcess ? fromEnv(process.env.NEXT_PUBLIC_LEGAL_ENTITY_NAME) || fromEnv(process.env.LEGAL_ENTITY_NAME) : "";

export const BRAND = {
  name: "Local Loyalty",
  shortName: "Local",
  tagline: "One card for every shop on your street.",
  /** Where customers and owners write for help. Env: NEXT_PUBLIC_SUPPORT_EMAIL (or SUPPORT_EMAIL). Required in production. */
  supportEmail: supportEmail || (isProduction ? "" : DEV_SUPPORT_EMAIL),
  /** The registered business that sells the service (terms, privacy, receipts). Env: NEXT_PUBLIC_LEGAL_ENTITY_NAME (or LEGAL_ENTITY_NAME). Required in production. */
  legalName: legalName || (isProduction ? "" : DEV_LEGAL_NAME),
  /** International format, digits only, for wa.me links. A placeholder (seed data only); the marketing site reads NEXT_PUBLIC_WHATSAPP_NUMBER and hides the button when it is unset. */
  whatsappNumber: "14165550142",
  defaultCity: "Toronto",
  defaultCurrency: "CAD",
  defaultTimezone: "America/Toronto",
} as const;

/** True for an address that cannot receive mail: empty, malformed, or on a reserved test domain. */
export function isPlaceholderEmail(address: string | undefined): boolean {
  const a = (address ?? "").trim().replace(/^.*<([^>]+)>\s*$/, "$1");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a)) return true;
  const host = a.split("@")[1]!.toLowerCase();
  return /(^|\.)(example|invalid|test|localhost)$/.test(host) || /(^|\.)example\.(com|org|net)$/.test(host);
}

/** Launch-critical business facts that are missing or placeholders in this environment (empty list = fine). */
export function missingBrandConfig(e: Record<string, string | undefined> = hasProcess ? process.env : {}): string[] {
  const problems: string[] = [];
  const email = fromEnv(e.NEXT_PUBLIC_SUPPORT_EMAIL) || fromEnv(e.SUPPORT_EMAIL);
  if (!email) problems.push("NEXT_PUBLIC_SUPPORT_EMAIL (or SUPPORT_EMAIL) is not set: the address customers write to for help");
  else if (isPlaceholderEmail(email)) problems.push(`NEXT_PUBLIC_SUPPORT_EMAIL is a placeholder (${email}): use a real, monitored address`);
  if (!(fromEnv(e.NEXT_PUBLIC_LEGAL_ENTITY_NAME) || fromEnv(e.LEGAL_ENTITY_NAME))) problems.push("NEXT_PUBLIC_LEGAL_ENTITY_NAME (or LEGAL_ENTITY_NAME) is not set: the registered business name");
  return problems;
}
