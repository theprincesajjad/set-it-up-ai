/**
 * Wave O, team import: "Have a website or Instagram?" (onboarding step 1, and Settings, "Refresh from my website").
 *
 * The owner pastes their website; the API reads the homepage and at most three same-site pages (contact, about, services, menu,
 * book) behind an SSRF guard and returns what it found, each value with where it came from. Nothing is saved by the import
 * itself: the owner reviews every field, edits or drops it, and confirms. An Instagram link is never fetched (its terms forbid
 * scraping): only the handle is kept.
 */
import { z } from "zod";
import { VERTICALS } from "../verticals.js";
import { brandColorSchema, hoursSchema } from "./merchant.js";

/** POST /v1/site-import and POST /v1/merchants/:id/site-import */
export const siteImportBody = z.object({ url: z.string().trim().min(3).max(500) });
export type SiteImportBody = z.infer<typeof siteImportBody>;

/** Where a value came from, so the review card can say it ("From your page's title"). */
export const SITE_IMPORT_SOURCES = [
  "jsonld",
  "og",
  "title",
  "meta",
  "canonical",
  "tel_link",
  "page_text",
  "apple_touch_icon",
  "icon",
  "og_image",
  "theme_color",
  "css_vars",
  "css",
  "logo_color",
  "links",
  "keywords",
  "instagram_url",
  "price_list",
  "ai",
] as const;
export type SiteImportSource = (typeof SITE_IMPORT_SOURCES)[number];

export interface SiteImportField<T> {
  value: T;
  source: SiteImportSource;
  /** The page the value was read from (an absolute URL on the shop's site), when there is one. */
  page?: string | null;
}

export interface SiteImportService {
  name: string;
  /** Cents; null when no price was listed. */
  priceCents: number | null;
  source: SiteImportSource;
}

export interface SiteImportResult {
  /** Cache id (24 h). The apply call sends it back so the server uses the logo it downloaded, never a URL from the client. */
  id: string;
  /** The address we read (normalised), or the Instagram profile link. */
  url: string;
  kind: "website" | "instagram";
  fetchedAt: string;
  /** True when the result came from the 24-hour cache. */
  cached: boolean;
  /** Pages read, in order (homepage first). */
  pages: string[];
  fields: {
    name: SiteImportField<string> | null;
    /** A preview path for the downloaded logo (`/v1/site-import/<id>/logo`); the bytes are stored only when the owner confirms. */
    logo: (SiteImportField<string> & { contentType: string; bytes: number }) | null;
    website: SiteImportField<string> | null;
    /** Canadian E.164 (+1XXXXXXXXXX). */
    phone: SiteImportField<string> | null;
    /** A street address. Never applied to a home studio's public profile (address-privacy.ts). */
    address: SiteImportField<string> | null;
    hours: SiteImportField<z.infer<typeof hoursSchema>> | null;
    instagram: SiteImportField<string> | null;
    socials: SiteImportField<{ network: string; url: string }[]> | null;
    description: SiteImportField<string> | null;
    /** The colour as found and the usable one (contrast-checked, packages/design-tokens shopColor). */
    brandColor: (SiteImportField<string> & { found: string; adjusted: boolean }) | null;
    accentColor: SiteImportField<string> | null;
    /** Suggestions only: the owner ticks the ones to add. */
    services: SiteImportField<SiteImportService[]> | null;
    /** A guess at the trade, from keywords: a suggestion that preselects the chip. */
    vertical: SiteImportField<(typeof VERTICALS)[number]> | null;
  };
  /** Plain notes for the owner (Instagram: "We'll use your handle"). Message keys, so the web shows them in the owner's language. */
  notes: ("instagram_handle_only" | "robots_blocked_some" | "no_logo" | "ai_tidied" | "address_private")[];
  /** The tidy-up model ran (an AI key is configured and the quotas allow it). */
  ai: boolean;
}

/** POST /v1/merchants/:id/site-import/apply: the fields the owner kept, as they edited them. Omitted = leave as is. */
export const siteImportApplyBody = z
  .object({
    importId: z.uuid(),
    name: z.string().trim().min(2).max(120).optional(),
    /** Store the logo the import downloaded (the server reads its own cached bytes). */
    logo: z.boolean().optional(),
    /** Instagram imports have no logo: the owner can paste a link to one (https only). */
    logoUrl: z.url().max(2000).refine((u) => u.startsWith("https://"), { message: "Use an https link" }).optional(),
    website: z.url({ protocol: /^https?$/ }).max(2000).optional(),
    phone: z.string().min(7).max(20).optional(),
    instagram: z.string().trim().max(200).optional(),
    description: z.string().trim().max(2000).optional(),
    brandColor: brandColorSchema.optional(),
    hours: hoursSchema.optional(),
    /** Suggested services the owner ticked (appointment trades only). */
    services: z.array(z.object({ name: z.string().trim().min(1).max(120), priceCents: z.number().int().min(0).max(10_000_000) })).max(40).optional(),
  })
  .strict();
export type SiteImportApplyBody = z.input<typeof siteImportApplyBody>;

export interface SiteImportApplyResponse {
  applied: string[];
  logoUrl: string | null;
}
