/**
 * Website builder contracts (phase solo, workstream G). Docs: docs/engineering/api/site.md.
 *
 * Owner:  GET/PUT /v1/merchants/:id/site, POST .../site/draft (AI), .../site/rewrite (AI, one line), .../site/reset,
 *         .../site/publish, .../site/unpublish, GET .../site/preview, GET .../site/domain/check, POST/DELETE .../site/domain
 * Admin:  GET /v1/admin/site-domains, POST /v1/admin/site-domains/:domainId
 * Public: GET /v1/public/sites/:slug, GET /v1/public/sites/by-host/:host
 */
import { z } from "zod";
import { SITE_COPY_FIELD_KEYS, SITE_PRESETS, SITE_SECTIONS, type SiteContent, type SiteCopyField, type SitePreset } from "../site-presets.js";
import type { ProgramSummaryDto, RewardDto } from "./customer.js";
import type { PromoDto } from "./network.js";

export type SiteStatus = "draft" | "published" | "unpublished";
/** none: no custom domain; requested: waiting for an admin (manual path); pending: registered or connected, DNS or TLS not ready; live; failed. */
export type SiteDomainStatus = "none" | "requested" | "pending" | "live" | "failed";

export interface SiteUsageDto {
  drafts: { used: number; limit: number };
  edits: { used: number; limit: number };
  /** The current allowance window (monthly, anchored on the billing date). */
  periodStart: string;
  periodEnd: string;
}

export interface SiteEntitlementDto {
  /** Can publish: the annual paid plan (or an admin grant). */
  entitled: boolean;
  /** Why not, for the plan line: "monthly" (paid monthly: switch to annual), "free". */
  reason: "annual" | "monthly" | "free" | "grant";
  /** Set when a published site lost the annual plan: it stays up with a banner until graceEndsAt, then the custom domain stops. */
  lapsed: { since: string; graceEndsAt: string; domainRouted: boolean } | null;
}

export interface SiteDomainDto {
  hostname: string;
  status: SiteDomainStatus;
  /** register: we register it (a .ca); connect: the owner already has it. */
  mode: "register" | "connect";
  /** DNS records the owner (connect) or we (register) must set, when known. */
  dns: { type: "CNAME" | "TXT" | "A"; name: string; value: string }[];
  note: string | null;
  requestedAt: string;
  liveAt: string | null;
}

export interface SiteDto {
  status: SiteStatus;
  /** The working copy the builder edits. */
  draft: SiteContent;
  /** What the public page shows; null until the first publish. */
  published: SiteContent | null;
  /** Draft differs from the published version. */
  unpublishedChanges: boolean;
  publishedAt: string | null;
  updatedAt: string;
  domain: SiteDomainDto | null;
  /** Always available: {siteUrl}/s/{slug}. */
  path: string;
}

export interface SiteBuilderResponse {
  site: SiteDto;
  entitlement: SiteEntitlementDto;
  usage: SiteUsageDto;
  /** AI copy is available (an API key is set on the server). Off: presets and template copy only. */
  aiAvailable: boolean;
  /** SITE_DOMAINS_ENABLED: automatic .ca registration and routing. Off: domains are requested by hand and set up by our team. */
  domainsAuto: boolean;
}

export interface SiteDraftResponse extends SiteBuilderResponse {
  /** ai: the model wrote it; fallback: it could not (refusal, bad output, outage) and the template copy was used. */
  outcome: "ai" | "fallback";
  /** Plain message for the owner on fallback. */
  message: string | null;
}

export interface SiteRewriteResponse {
  field: SiteCopyField;
  text: string;
  outcome: "ai" | "fallback";
  message: string | null;
  usage: SiteUsageDto;
}

export interface DomainCheckResponse {
  hostname: string;
  /** null when we cannot tell (automatic registration is off): the team checks by hand. */
  available: boolean | null;
  /** Yearly price, in cents (CAD); included on the annual plan. */
  priceCents: number | null;
  included: boolean;
  auto: boolean;
}

// ---------------------------------------------------------------------------
// Public page data: the published words plus live shop data. No street address unless the shop shows it.
// ---------------------------------------------------------------------------
export interface PublicSiteService {
  id: string;
  name: string;
  description: string | null;
  durationMin: number;
  priceCents: number;
  priceFrom: boolean;
  categoryName: string | null;
}

export interface PublicSiteResponse {
  slug: string;
  content: SiteContent;
  /** draft: an owner preview. */
  mode: "published" | "preview";
  /** The annual plan lapsed: show the banner until this date. */
  lapseBannerUntil: string | null;
  canonicalHost: string | null;
  shop: {
    id: string;
    name: string;
    slug: string;
    vertical: string;
    logoUrl: string | null;
    coverUrl: string | null;
    brandColor: string | null;
    description: string | null;
    phone: string | null;
    instagram: string | null;
    timezone: string;
    themeStyle: "clear" | "warm";
  };
  location: {
    /** exact: storefront, the address shows; area / city: label and pin only. */
    visibility: "exact" | "area" | "city";
    areaLabel: string | null;
    city: string | null;
    /** Only when visibility is exact. */
    address: string | null;
    postalCode: string | null;
    /** The public pin (the area pin for area / city shops). */
    pin: { lat: number; lng: number } | null;
    hours: Record<string, [string, string][]> | null;
  } | null;
  booking: { enabled: boolean };
  services: PublicSiteService[];
  loyalty: { program: ProgramSummaryDto; rewards: RewardDto[] } | null;
  promos: PromoDto[];
  /** Private 1–5 ratings, shown as an average once there are at least 3. */
  reviews: { count: number; average: number } | null;
  /** The best way to message the shop: instagram, whatsapp, text or email. */
  message: { kind: "instagram" | "whatsapp" | "sms" | "email"; href: string } | null;
}

// ---------------------------------------------------------------------------
// Bodies
// ---------------------------------------------------------------------------
const copyLines = z.record(z.string(), z.record(z.string(), z.string().max(2000)));

export const saveSiteBody = z
  .object({
    preset: z.enum(SITE_PRESETS).optional(),
    order: z.array(z.enum(SITE_SECTIONS)).max(20).optional(),
    hidden: z.array(z.enum(SITE_SECTIONS)).max(20).optional(),
    copy: copyLines.optional(),
  })
  .strict();
export type SaveSiteBody = z.infer<typeof saveSiteBody>;

export const draftSiteBody = z.object({ preset: z.enum(SITE_PRESETS).optional(), brief: z.string().max(400).optional() }).strict();
export type DraftSiteBody = z.infer<typeof draftSiteBody>;

export const rewriteBody = z
  .object({
    field: z.enum(SITE_COPY_FIELD_KEYS as [SiteCopyField, ...SiteCopyField[]]),
    instruction: z.string().max(200).optional(),
  })
  .strict();
export type RewriteBody = z.infer<typeof rewriteBody>;

export const resetBody = z.object({ preset: z.enum(SITE_PRESETS).optional() }).strict();

export const domainCheckQuery = z.object({ name: z.string().min(3).max(253) });

export const domainRequestBody = z.object({ hostname: z.string().min(3).max(253), mode: z.enum(["register", "connect"]) }).strict();
export type DomainRequestBody = z.infer<typeof domainRequestBody>;

export const adminDomainUpdateBody = z
  .object({
    status: z.enum(["requested", "pending", "live", "failed"]),
    registrarRef: z.string().max(200).optional(),
    note: z.string().max(500).optional(),
  })
  .strict();
export type AdminDomainUpdateBody = z.infer<typeof adminDomainUpdateBody>;

export interface AdminSiteDomainDto extends SiteDomainDto {
  id: string;
  merchantId: string;
  merchantName: string;
  merchantSlug: string;
  registrarRef: string | null;
}

export type { SiteContent, SitePreset, SiteCopyField };
