/**
 * Single source of truth for the product name. "Local Loyalty" is a working
 * name; change it here and every app picks it up.
 */
export const BRAND = {
  name: "Local Loyalty",
  shortName: "Local",
  tagline: "One card for every shop on your street.",
  supportEmail: "hello@localloyalty.example",
  /** International format, digits only, for wa.me links. A placeholder (seed data only); the marketing site reads NEXT_PUBLIC_WHATSAPP_NUMBER and hides the button when it is unset. */
  whatsappNumber: "14165550142",
  defaultCity: "Toronto",
  defaultCurrency: "CAD",
  defaultTimezone: "America/Toronto",
} as const;
