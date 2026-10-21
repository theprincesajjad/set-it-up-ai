/**
 * Single source of truth for the product name. "Local Loyalty" is a working
 * name; change it here and every app picks it up.
 */
export const BRAND = {
  name: "Local Loyalty",
  shortName: "Local",
  tagline: "One app for every shop on your street.",
  supportEmail: "hello@localloyalty.example",
  defaultCity: "Toronto",
  defaultCurrency: "CAD",
  defaultTimezone: "America/Toronto",
} as const;
