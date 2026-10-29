/**
 * The built-in website builder (phase solo, workstream G): three presets, the sections each one can show, what every section
 * binds to in the shop's live data, and the template copy that ships with no AI at all (the zero-cost path).
 *
 * A site is { preset, order, hidden, copy }. The copy is words only: names, prices, hours, rewards, promos, ratings and the map
 * pin are never stored in the site, they are read live from the shop every time the page renders. So a price change shows up on
 * the site at once, and the AI can never invent a price.
 *
 * Docs: docs/engineering/site-builder.md.
 */

export const SITE_PRESETS = ["studio", "portfolio", "shopfront"] as const;
export type SitePreset = (typeof SITE_PRESETS)[number];

export const SITE_SECTIONS = ["hero", "services", "reviews", "loyalty", "promos", "about", "hours", "map", "contact"] as const;
export type SiteSection = (typeof SITE_SECTIONS)[number];

/** What a section reads from the shop. The renderer fetches these live; the site stores none of them. */
export type SiteBinding = "shop" | "booking" | "services" | "reviews" | "loyalty" | "promos" | "hours" | "map" | "contact";

export const SECTION_BINDINGS: Record<SiteSection, readonly SiteBinding[]> = {
  hero: ["shop", "booking"],
  services: ["services", "booking"],
  reviews: ["reviews"],
  loyalty: ["loyalty"],
  promos: ["promos"],
  about: ["shop"],
  hours: ["hours"],
  // The map follows the address rule: an "area" or "city" shop shows the area pin and label, never the street address.
  map: ["map"],
  contact: ["contact"],
};

export interface SitePresetDef {
  id: SitePreset;
  /** Who it is for, for the picker and the model. */
  bestFor: string;
  /** Default section order. */
  sections: readonly SiteSection[];
  /** Always shown, cannot be hidden or moved off the top (hero) / out of the page. */
  required: readonly SiteSection[];
  /** The look the renderer uses: layout only, colours come from the Clear tokens and the trade accent. */
  layout: "split" | "centred" | "banner";
}

export const SITE_PRESET_DEFS: Record<SitePreset, SitePresetDef> = {
  studio: {
    id: "studio",
    bestFor: "Solo pros and small studios who take bookings: nails, brows, lashes, hair, barbers, groomers.",
    sections: ["hero", "services", "reviews", "loyalty", "about", "hours", "map", "contact"],
    required: ["hero", "services"],
    layout: "split",
  },
  portfolio: {
    id: "portfolio",
    bestFor: "Makeup artists and pros whose name is the brand; leads with who you are, then what to book.",
    sections: ["hero", "about", "services", "reviews", "promos", "contact", "map"],
    required: ["hero", "about"],
    layout: "centred",
  },
  shopfront: {
    id: "shopfront",
    bestFor: "Cafés, bakeries and shops people walk into; leads with this week's offers, the rewards and the hours.",
    sections: ["hero", "promos", "loyalty", "about", "hours", "map", "contact"],
    required: ["hero", "hours"],
    layout: "banner",
  },
};

/** The preset a trade starts on (the owner can switch). */
export function defaultPresetFor(vertical: string | null | undefined): SitePreset {
  const v = vertical ?? "";
  if (["makeup"].includes(v)) return "portfolio";
  if (["cafe", "bakery", "restaurant", "restaurant_south_asian", "grocery", "retail", "pharmacy", "tiffin", "caterer", "banquet_hall"].includes(v)) return "shopfront";
  return "studio";
}

// ---------------------------------------------------------------------------
// Copy
// ---------------------------------------------------------------------------

/** Every line of words on a site. Each line can be typed over or rewritten on its own. */
export interface SiteCopy {
  hero: { headline: string; subhead: string; cta: string };
  about: { title: string; body: string };
  services: { title: string; intro: string };
  reviews: { title: string };
  loyalty: { title: string; body: string };
  promos: { title: string; intro: string };
  hours: { title: string };
  map: { title: string; note: string };
  contact: { title: string; body: string };
  seo: { title: string; description: string };
}

/** The editable lines, as "section.field" paths, with the longest text each one may hold. */
export const SITE_COPY_FIELDS = {
  "hero.headline": 70,
  "hero.subhead": 160,
  "hero.cta": 24,
  "about.title": 50,
  "about.body": 600,
  "services.title": 50,
  "services.intro": 200,
  "reviews.title": 50,
  "loyalty.title": 50,
  "loyalty.body": 200,
  "promos.title": 50,
  "promos.intro": 200,
  "hours.title": 50,
  "map.title": 50,
  "map.note": 160,
  "contact.title": 50,
  "contact.body": 200,
  "seo.title": 60,
  "seo.description": 160,
} as const;
export type SiteCopyField = keyof typeof SITE_COPY_FIELDS;
export const SITE_COPY_FIELD_KEYS = Object.keys(SITE_COPY_FIELDS) as SiteCopyField[];

/** The lines a single-line rewrite may touch: short lines go to the small model; long bodies too, one at a time. */
export function getCopyField(copy: SiteCopy, field: SiteCopyField): string {
  const [s, f] = field.split(".") as [keyof SiteCopy, string];
  return (copy[s] as Record<string, string>)[f] ?? "";
}

export function setCopyField(copy: SiteCopy, field: SiteCopyField, value: string): SiteCopy {
  const [s, f] = field.split(".") as [keyof SiteCopy, string];
  return { ...copy, [s]: { ...(copy[s] as Record<string, string>), [f]: clampLine(value, SITE_COPY_FIELDS[field]) } } as SiteCopy;
}

/** Trim, collapse runs of spaces (keeping paragraph breaks in bodies) and cut to the field's length on a word boundary. */
export function clampLine(value: string, max: number): string {
  const v = value.replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (v.length <= max) return v;
  const cut = v.slice(0, max);
  const at = cut.lastIndexOf(" ");
  return (at > max * 0.6 ? cut.slice(0, at) : cut).replace(/[\s,;:–-]+$/, "").trim();
}

/** Fit any copy-shaped object to the limits (model output, an old saved draft). Missing lines come from `fallback`. */
export function normalizeCopy(input: unknown, fallback: SiteCopy): SiteCopy {
  let out = fallback;
  const src = (input && typeof input === "object" ? input : {}) as Record<string, Record<string, unknown> | undefined>;
  for (const field of SITE_COPY_FIELD_KEYS) {
    const [s, f] = field.split(".") as [string, string];
    const v = src[s]?.[f];
    if (typeof v === "string" && v.trim()) out = setCopyField(out, field, v);
  }
  return out;
}

export interface SiteShopFacts {
  name: string;
  /** A plain trade word for copy ("nail studio", "barbershop", "café"). */
  tradeLabel: string;
  /** Neighbourhood or area label ("Bloor West"); null when unknown. Never the street address. */
  areaLabel: string | null;
  city: string | null;
  /** Takes online bookings. */
  books: boolean;
  /** Runs a stamp or points card. */
  hasLoyalty: boolean;
}

/** A plain trade word per vertical for template copy. Unknown verticals read "shop". */
export function tradeLabelFor(vertical: string | null | undefined): string {
  const map: Record<string, string> = {
    nails: "nail studio",
    brows_lashes: "brow and lash studio",
    makeup: "makeup studio",
    salon: "salon",
    barber: "barbershop",
    spa: "spa",
    pet: "grooming studio",
    cafe: "café",
    bakery: "bakery",
    restaurant: "restaurant",
    restaurant_south_asian: "restaurant",
    grocery: "grocery",
    retail: "shop",
    fitness: "studio",
    repair_auto: "garage",
  };
  return map[vertical ?? ""] ?? "shop";
}

/**
 * Template copy: what a site says with no AI, written to ux-copy.md (sentence case, plain words, Canadian spelling, no hype).
 * Good enough to publish in one tap.
 */
export function defaultCopy(preset: SitePreset, shop: SiteShopFacts): SiteCopy {
  const where = shop.areaLabel ?? shop.city;
  const inWhere = where ? ` in ${where}` : "";
  const book = shop.books ? "Book online" : "Visit us";
  const byPreset: Record<SitePreset, Pick<SiteCopy, "hero" | "about">> = {
    studio: {
      hero: { headline: shop.name, subhead: `A ${shop.tradeLabel}${inWhere}. Pick a time that suits you and book in a minute.`, cta: book },
      about: { title: "About the studio", body: `${shop.name} is a ${shop.tradeLabel}${inWhere}. Every visit is booked ahead, so you never wait, and regulars collect rewards as they go.` },
    },
    portfolio: {
      hero: { headline: shop.name, subhead: `${cap(shop.tradeLabel)}${inWhere}. See the work, then book your spot.`, cta: book },
      about: { title: "Hi, I'm glad you're here", body: `I run ${shop.name}${inWhere}. Have a look at what I offer below, and book the time that works for you. Questions first? Send me a message.` },
    },
    shopfront: {
      hero: { headline: shop.name, subhead: `Your neighbourhood ${shop.tradeLabel}${inWhere}. Come by, and collect rewards every visit.`, cta: shop.books ? book : shop.hasLoyalty ? "Join the rewards" : book },
      about: { title: "About us", body: `${shop.name} is a ${shop.tradeLabel}${inWhere}. We're glad to be part of the street, and we keep a little thank-you for the people who come back.` },
    },
  };
  return {
    ...byPreset[preset],
    services: { title: "Services and prices", intro: shop.books ? "Prices include the time it takes. Pick one to see open times." : "What we offer, and what it costs." },
    reviews: { title: "What clients say" },
    loyalty: { title: "Rewards for regulars", body: "Join free with your phone number and collect on every visit. Your card lives on your phone." },
    promos: { title: "This week's offers", intro: "On now for members and new faces alike." },
    hours: { title: "Hours" },
    map: { title: "Where to find us", note: where ? `We're in ${where}. You'll get the exact address when you book.` : "You'll get the exact address when you book." },
    contact: { title: "Get in touch", body: "Questions about a service or a time? Send a message and we'll get back to you." },
    seo: { title: clampLine(`${shop.name}${where ? ` · ${where}` : ""}`, 60), description: clampLine(`${cap(shop.tradeLabel)}${inWhere}. ${shop.books ? "Book online, " : ""}see prices and join the rewards.`, 160) },
  };
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Keep a stored or model-suggested order valid for the preset: only its sections, no repeats, hero first, required ones present. */
export function normalizeOrder(preset: SitePreset, order: readonly string[] | null | undefined): SiteSection[] {
  const def = SITE_PRESET_DEFS[preset];
  const allowed = new Set<string>(def.sections);
  const seen = new Set<string>();
  const out: SiteSection[] = [];
  for (const s of order ?? []) {
    if (allowed.has(s) && !seen.has(s) && s !== "hero") {
      seen.add(s);
      out.push(s as SiteSection);
    }
  }
  for (const s of def.sections) if (s !== "hero" && !seen.has(s)) out.push(s);
  return ["hero", ...out];
}

/** Hidden sections, minus anything the preset requires. */
export function normalizeHidden(preset: SitePreset, hidden: readonly string[] | null | undefined): SiteSection[] {
  const def = SITE_PRESET_DEFS[preset];
  return [...new Set(hidden ?? [])].filter((s): s is SiteSection => (def.sections as readonly string[]).includes(s) && !def.required.includes(s as SiteSection));
}

export interface SiteContent {
  preset: SitePreset;
  order: SiteSection[];
  hidden: SiteSection[];
  copy: SiteCopy;
}

/** A complete preset with template copy: what "Publish now" ships. */
export function defaultContent(preset: SitePreset, shop: SiteShopFacts): SiteContent {
  return { preset, order: normalizeOrder(preset, null), hidden: [], copy: defaultCopy(preset, shop) };
}

/** Days a published site stays up with a banner after the annual plan lapses; then the custom domain stops routing. */
export const SITE_LAPSE_GRACE_DAYS = 30;

/** Hostnames: a bare registrable name we can route, lower case, no scheme, no path, a dot somewhere. */
export function normalizeHostname(raw: string): string | null {
  const h = raw.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/\.$/, "").replace(/^www\./, "");
  if (h.length < 4 || h.length > 253) return null;
  if (!/^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(h)) return null;
  return h;
}

/** We register `.ca` names only. A domain the owner already has (entered by hand) can be any name. */
export function isCaDomain(h: string): boolean {
  return /^[a-z0-9-]+\.ca$/.test(h);
}
