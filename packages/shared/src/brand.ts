/**
 * Single source of truth for the product name. "Local Loyalty" is a working
 * name; change it here and every app picks it up.
 */
export const BRAND = {
  name: "Local Loyalty",
  shortName: "Local",
  tagline: "One app for every shop on your street.",
  supportEmail: "hello@localloyalty.example",
  /** International format, digits only, for wa.me links. A placeholder like supportEmail; the web reads NEXT_PUBLIC_WHATSAPP_NUMBER first. */
  whatsappNumber: "14165550142",
  defaultCity: "Toronto",
  defaultCurrency: "CAD",
  defaultTimezone: "America/Toronto",
} as const;
