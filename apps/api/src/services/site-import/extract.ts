/**
 * What one HTML page says about the business: pure functions over the page text, no network. A small tag reader (meta, link,
 * a, script, title, style, address) is enough for the common builders (Squarespace, Wix, Shopify, WordPress and hand-made
 * pages) without a DOM.
 */
import type { merchantApi } from "@ll/shared";
import { VERTICALS } from "@ll/shared";
import { cssVarColors } from "./colors.js";

type Hours = merchantApi.Hours;
type Vertical = (typeof VERTICALS)[number];

export interface Attrs {
  [k: string]: string;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", middot: "·", eacute: "é", hellip: "…", bull: "•", reg: "®", trade: "™", copy: "©" };
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

const clean = (s: string) => decodeEntities(s).replace(/[\u0000-\u001f​]+/g, " ").replace(/\s+/g, " ").trim();

export function parseAttrs(tag: string): Attrs {
  const out: Attrs = {};
  const inner = tag.replace(/^<\s*[\w:-]+/, "").replace(/\/?>$/, "");
  for (const m of inner.matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) out[m[1]!.toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? "");
  return out;
}

export function tags(html: string, name: string): Attrs[] {
  return [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, "gi"))].map((m) => parseAttrs(m[0]));
}

/** Visible text of a fragment: scripts, styles and tags out, entities decoded. */
export function textOf(html: string): string {
  return clean(html.replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, " ").replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li|h\d|tr|td|section|address)>/gi, "\n").replace(/<[^>]+>/g, " "));
}

/** Text with line breaks kept (price lists, addresses). */
function linesOf(html: string): string[] {
  return decodeEntities(html.replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, " ").replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li|h\d|tr|dt|dd|section|address|span)>/gi, "\n").replace(/<td\b[^>]*>/gi, " … ").replace(/<[^>]+>/g, " "))
    .split(/\n+/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

const abs = (href: string | undefined, base: string): string | null => {
  if (!href) return null;
  try {
    const u = new URL(href.trim(), base);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
};

// ---------------------------------------------------------------------------
// JSON-LD
// ---------------------------------------------------------------------------
type Node = Record<string, unknown>;

export function jsonLdNodes(html: string): Node[] {
  const out: Node[] = [];
  const walk = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") {
      const n = v as Node;
      out.push(n);
      if (Array.isArray(n["@graph"])) (n["@graph"] as unknown[]).forEach(walk);
    }
  };
  for (const m of html.matchAll(/<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      walk(JSON.parse(m[1]!.trim().replace(/^<!--|-->$/g, "")));
    } catch {
      // A broken block: skip it, keep the others.
    }
  }
  return out;
}

const typesOf = (n: Node): string[] => (Array.isArray(n["@type"]) ? (n["@type"] as unknown[]) : [n["@type"]]).filter((t): t is string => typeof t === "string");
const BUSINESS_TYPES = /(LocalBusiness|Store|Restaurant|CafeOrCoffeeShop|Bakery|BarOrPub|FoodEstablishment|BeautySalon|HairSalon|NailSalon|DaySpa|HealthAndBeautyBusiness|ExerciseGym|HealthClub|SportsActivityLocation|AutoRepair|AutomotiveBusiness|Pharmacy|Florist|PetStore|GroceryStore|ProfessionalService|Dentist|MedicalBusiness|Physician|Barber|TattooParlor|ClothingStore|HomeAndConstructionBusiness|Library|EntertainmentBusiness|LodgingBusiness|DryCleaningOrLaundry|ShoppingCenter|Bakery)$/;

export function businessNode(nodes: Node[]): Node | null {
  return nodes.find((n) => typesOf(n).some((t) => BUSINESS_TYPES.test(t))) ?? null;
}
const orgNode = (nodes: Node[]) => nodes.find((n) => typesOf(n).some((t) => t === "Organization" || t === "Corporation" || t === "WebSite")) ?? null;

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? clean(v) : null);
const imageUrl = (v: unknown): string | null => {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return imageUrl(v[0]);
  if (v && typeof v === "object") return str((v as Node).url) ?? str((v as Node).contentUrl) ?? str((v as Node)["@id"]);
  return null;
};

function jsonLdAddress(v: unknown): string | null {
  if (typeof v === "string") return clean(v);
  if (Array.isArray(v)) return jsonLdAddress(v[0]);
  if (!v || typeof v !== "object") return null;
  const a = v as Node;
  const parts = [str(a.streetAddress), str(a.addressLocality), [str(a.addressRegion), str(a.postalCode)].filter(Boolean).join(" ")].filter((x) => x && x.trim());
  return parts.length ? parts.join(", ") : null;
}

const DAY_FROM: Record<string, merchantApi.DayKey> = { monday: "mon", tuesday: "tue", wednesday: "wed", thursday: "thu", friday: "fri", saturday: "sat", sunday: "sun", mo: "mon", tu: "tue", we: "wed", th: "thu", fr: "fri", sa: "sat", su: "sun" };
const ORDER: merchantApi.DayKey[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const hhmm = (s: unknown): string | null => {
  const m = typeof s === "string" ? /^(\d{1,2}):(\d{2})/.exec(s.trim()) : null;
  if (!m) return null;
  const h = Number(m[1]);
  return h <= 24 ? `${String(h === 24 ? 23 : h).padStart(2, "0")}:${h === 24 ? "59" : m[2]}` : null;
};
const dayKey = (d: unknown): merchantApi.DayKey | null => {
  if (typeof d !== "string") return null;
  const k = d.replace(/^https?:\/\/schema\.org\//i, "").trim().toLowerCase();
  return DAY_FROM[k] ?? null;
};

/** openingHoursSpecification (and the short "Mo-Fr 09:00-17:00" form) to the app's Hours. */
export function jsonLdHours(n: Node): Hours | null {
  const hours: Hours = {};
  const add = (day: merchantApi.DayKey, open: string | null, close: string | null) => {
    if (!open || !close || close <= open) return;
    const list = hours[day] ?? [];
    if (list.length < 4) list.push([open, close]);
    hours[day] = list;
  };
  const specs = n.openingHoursSpecification;
  for (const s of (Array.isArray(specs) ? specs : specs ? [specs] : []) as Node[]) {
    if (!s || typeof s !== "object") continue;
    const days = Array.isArray(s.dayOfWeek) ? s.dayOfWeek : [s.dayOfWeek];
    for (const d of days) {
      const k = dayKey(d);
      if (k) add(k, hhmm(s.opens), hhmm(s.closes));
    }
  }
  const short = n.openingHours;
  for (const line of (Array.isArray(short) ? short : short ? [short] : []) as unknown[]) {
    if (typeof line !== "string") continue;
    const m = /^\s*([A-Za-z]{2})(?:\s*-\s*([A-Za-z]{2}))?((?:\s*,\s*[A-Za-z]{2})*)\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/.exec(line);
    if (!m) continue;
    const from = DAY_FROM[m[1]!.toLowerCase()];
    const to = m[2] ? DAY_FROM[m[2].toLowerCase()] : from;
    if (!from || !to) continue;
    const i = ORDER.indexOf(from);
    const j = ORDER.indexOf(to);
    const days = i <= j ? ORDER.slice(i, j + 1) : [...ORDER.slice(i), ...ORDER.slice(0, j + 1)];
    for (const extra of (m[3] ?? "").split(",").map((x) => DAY_FROM[x.trim().toLowerCase()]).filter(Boolean)) days.push(extra!);
    for (const d of days) add(d, hhmm(m[4]), hhmm(m[5]));
  }
  return Object.keys(hours).length ? hours : null;
}

// ---------------------------------------------------------------------------
// Phone, address, socials, services, trade
// ---------------------------------------------------------------------------
/** A North American number to the app's E.164 (+1XXXXXXXXXX), or null (area code and exchange can't start with 0 or 1). */
export function toCanadianE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let d = raw.replace(/^tel:/i, "").replace(/[^\d+]/g, "");
  if (d.startsWith("+")) {
    if (!d.startsWith("+1")) return null;
    d = d.slice(2);
  } else if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
  if (!/^\d{10}$/.test(d) || /^[01]/.test(d) || /^[01]/.test(d.slice(3))) return null;
  return `+1${d}`;
}

const PHONE_TEXT = /(?:\+?1[\s.-]?)?\(?\b([2-9]\d{2})\)?[\s.-]?([2-9]\d{2})[\s.-](\d{4})\b/;

const STREET = /\b\d{1,6}[A-Za-z]?\s+(?:[A-Z][\w'.-]*\s+){1,4}(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Boulevard|Dr|Drive|Way|Cres|Crescent|Crt|Court|Ln|Lane|Pl|Place|Pkwy|Parkway|Hwy|Highway|Sq|Square|Terr|Terrace|Gate|Line|Trail|Circle|Cir)\b\.?(?:\s+(?:E|W|N|S|East|West|North|South))?(?:,?\s*(?:Unit|Suite|#)\s*\w+)?(?:,?\s*[A-Z][a-z]+(?:\s[A-Z][a-z]+)?)?(?:,?\s*(?:ON|Ontario|BC|AB|QC|MB|SK|NS|NB|NL|PE))?(?:,?\s*[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z]\s?\d[ABCEGHJ-NPRSTV-Z]\d)?/;

export function visibleAddress(html: string): string | null {
  for (const m of html.matchAll(/<address\b[^>]*>([\s\S]*?)<\/address>/gi)) {
    const t = textOf(m[1]!).replace(/\s*\n\s*/g, ", ");
    const hit = STREET.exec(t);
    if (hit) return hit[0].trim();
  }
  const hit = STREET.exec(textOf(html));
  return hit ? hit[0].trim() : null;
}

export const SOCIAL_HOSTS: Record<string, string> = { "instagram.com": "instagram", "facebook.com": "facebook", "tiktok.com": "tiktok", "x.com": "x", "twitter.com": "x", "youtube.com": "youtube", "pinterest.com": "pinterest", "pinterest.ca": "pinterest", "linkedin.com": "linkedin", "yelp.ca": "yelp", "yelp.com": "yelp" };
const IG_RESERVED = new Set(["p", "reel", "reels", "explore", "accounts", "stories", "tv", "direct", "about", "developer", "legal", "web"]);

/** "https://www.instagram.com/priyanails/?hl=en" → "priyanails"; null for posts, reels and other non-profile paths. */
export function instagramHandle(raw: string): string | null {
  const m = /^(?:https?:\/\/)?(?:www\.|m\.)?instagram\.com\/([A-Za-z0-9_.]{1,30})\/?(?:[?#].*)?$/i.exec(raw.trim());
  if (!m) return null;
  const h = m[1]!.toLowerCase();
  return IG_RESERVED.has(h) ? null : h;
}

export function socialOf(url: string): { network: string; url: string } | null {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase().replace(/^(www|m)\./, "");
    const network = SOCIAL_HOSTS[host];
    if (!network || u.pathname.length < 2) return null;
    if (/\/(sharer|share|intent|dialog|plugins)\b/.test(u.pathname)) return null;
    return { network, url: `${u.protocol}//${u.hostname}${u.pathname.replace(/\/+$/, "")}` };
  } catch {
    return null;
  }
}

export interface ServiceGuess {
  name: string;
  priceCents: number | null;
}

/** JSON-LD offers and services (makesOffer, hasOfferCatalog, Service nodes, Product with an offer). */
export function jsonLdServices(nodes: Node[]): ServiceGuess[] {
  const out: ServiceGuess[] = [];
  const price = (o: unknown): number | null => {
    if (!o || typeof o !== "object") return null;
    const p = (o as Node).price ?? ((o as Node).priceSpecification as Node | undefined)?.price;
    const n = typeof p === "number" ? p : typeof p === "string" ? parseFloat(p.replace(/[^\d.]/g, "")) : NaN;
    return Number.isFinite(n) && n >= 0 && n < 100_000 ? Math.round(n * 100) : null;
  };
  const visit = (o: unknown, depth = 0) => {
    if (!o || typeof o !== "object" || depth > 5) return;
    if (Array.isArray(o)) return o.forEach((x) => visit(x, depth + 1));
    const n = o as Node;
    const t = typesOf(n);
    if (t.includes("Offer")) {
      const item = n.itemOffered as Node | undefined;
      const name = str(item?.name) ?? str(n.name);
      if (name) out.push({ name, priceCents: price(n) });
      return;
    }
    if (t.includes("Service") || t.includes("Product") || t.includes("MenuItem")) {
      const name = str(n.name);
      if (name) out.push({ name, priceCents: price(Array.isArray(n.offers) ? n.offers[0] : n.offers) });
      return;
    }
    for (const k of ["makesOffer", "hasOfferCatalog", "itemListElement", "hasMenu", "hasMenuSection", "hasMenuItem", "offers"]) if (n[k]) visit(n[k], depth + 1);
  };
  nodes.forEach((n) => visit(n));
  return dedupeServices(out);
}

/** "Gel manicure ........ $40" / "Gel manicure – $40" / "Classic cut $35+": a line with a name and one dollar price. */
export function priceListServices(html: string): ServiceGuess[] {
  const out: ServiceGuess[] = [];
  const lines = linesOf(html);
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!.replace(/^[…|•·\s-]+/, "");
    let m = /^([A-Za-z][\w&'’()/+,. -]{1,60}?)\s*(?:[.…·:|–—-]{1,}\s*|\s{1,})(?:from\s+)?(?:CA)?\$\s?(\d{1,4}(?:\.\d{2})?)\+?\s*$/i.exec(l);
    if (!m && i + 1 < lines.length && /^[A-Za-z][\w&'’()/+,. -]{1,60}$/.test(l)) {
      const next = /^(?:from\s+)?(?:CA)?\$\s?(\d{1,4}(?:\.\d{2})?)\+?$/i.exec(lines[i + 1]!.replace(/^[…|•·\s-]+/, ""));
      if (next) m = [l, l, next[1]!] as unknown as RegExpExecArray;
    }
    if (!m) continue;
    const name = m[1]!.replace(/[.…·:|–—\s-]+$/, "").trim();
    if (name.length < 3 || /^(total|tax|subtotal|price|prices|from|starting|gift card|shipping)\b/i.test(name)) continue;
    out.push({ name, priceCents: Math.round(parseFloat(m[2]!) * 100) });
  }
  return dedupeServices(out);
}

function dedupeServices(list: ServiceGuess[]): ServiceGuess[] {
  const seen = new Set<string>();
  return list.filter((s) => {
    const k = s.name.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, 25);
}

/** Keywords per trade, strongest first. The guess is a suggestion that preselects the chip; the owner can change it. */
const TRADE_WORDS: [Vertical, RegExp][] = [
  ["nails", /\b(nail salon|nails?\b|manicure|pedicure|gel polish|acrylics?|dip powder|nail art)/gi],
  ["brows_lashes", /\b(lash(es)? extensions?|lash lift|brow lamination|microblading|threading|brows?\b|lashes)/gi],
  ["barber", /\b(barber(shop)?|fades?|beard trim|line ?up|hot towel shave)/gi],
  ["salon", /\b(hair salon|balayage|highlights|blow ?dry|haircuts?|colourist|colorist|keratin)/gi],
  ["makeup", /\b(makeup artist|bridal makeup|mua\b|airbrush makeup)/gi],
  ["spa", /\b(day spa|facials?|massage|waxing|body treatments?)/gi],
  ["cafe", /\b(caf[eé]|coffee|espresso|latte|cappuccino|roaster)/gi],
  ["bakery", /\b(bakery|bakeshop|sourdough|pastr(y|ies)|croissants?|cakes?\b|cupcakes?)/gi],
  ["restaurant_south_asian", /\b(biryani|tandoor|karahi|nihari|dosa|thali|chaat|halwa puri)/gi],
  ["tiffin", /\b(tiffin|meal plans? delivered|home-?style meals)/gi],
  ["restaurant", /\b(restaurant|dine[- ]in|reservations|brunch|bistro|eatery|takeout)/gi],
  ["grocery", /\b(grocer(y|s)|butcher|halal meat|produce market)/gi],
  ["pharmacy", /\b(pharmacy|pharmacist|prescriptions?)/gi],
  ["fitness", /\b(gym|fitness|yoga|pilates|personal training|crossfit|spin classes?)/gi],
  ["pet", /\b(pet (store|shop|grooming)|dog grooming|groomer|cat grooming)/gi],
  ["repair_auto", /\b(auto repair|mechanic|oil change|brakes|tire (shop|change))/gi],
  ["repair_electronics", /\b(phone repair|screen repair|computer repair|laptop repair)/gi],
  ["florist", /\b(florist|flower shop|bouquets?)/gi],
  ["dry_cleaning", /\b(dry clean(ing|ers)|laundry)/gi],
  ["alterations", /\b(alterations|tailor(ing)?|hemming)/gi],
];

export function guessTrade(text: string, jsonLdTypes: string[]): Vertical | null {
  const t = jsonLdTypes.join(" ");
  const byType: [RegExp, Vertical][] = [[/NailSalon/, "nails"], [/HairSalon/, "salon"], [/Barber/, "barber"], [/CafeOrCoffeeShop/, "cafe"], [/Bakery/, "bakery"], [/DaySpa/, "spa"], [/ExerciseGym|HealthClub/, "fitness"], [/Pharmacy/, "pharmacy"], [/Florist/, "florist"], [/PetStore/, "pet"], [/AutoRepair/, "repair_auto"], [/GroceryStore/, "grocery"], [/Restaurant/, "restaurant"]];
  for (const [re, v] of byType) if (re.test(t)) return v;
  let best: { v: Vertical; n: number } | null = null;
  for (const [v, re] of TRADE_WORDS) {
    const n = (text.match(re) ?? []).length;
    if (n >= 2 && (!best || n > best.n)) best = { v, n };
  }
  return best?.v ?? null;
}

// ---------------------------------------------------------------------------
// Name
// ---------------------------------------------------------------------------
const GENERIC = /^(home|homepage|home page|welcome|official site|official website|website|main|index|accueil|book now|book online|shop|menu)$/i;

/** "Home | Priya Nails" → "Priya Nails"; "Priya Nails – Nail salon in Toronto" → "Priya Nails". The segment closest to the domain wins. */
export function cleanTitle(title: string, host: string): string | null {
  const segs = clean(title).split(/\s+[|–—·:•»-]\s+|\s*\|\s*/).map((s) => s.trim()).filter((s) => s && !GENERIC.test(s) && s.length <= 80);
  if (!segs.length) return null;
  const label = host.replace(/^www\./, "").split(".")[0]!.replace(/[^a-z0-9]/g, "");
  const score = (s: string) => {
    const k = s.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!k) return 0;
    if (k === label) return 3;
    if (label.includes(k) || k.includes(label)) return 2;
    return 0;
  };
  const ranked = segs.map((s, i) => ({ s, sc: score(s), i })).sort((a, b) => b.sc - a.sc || a.i - b.i);
  return ranked[0]!.s;
}

// ---------------------------------------------------------------------------
// One page
// ---------------------------------------------------------------------------
export interface PageFacts {
  url: string;
  ldName: string | null;
  ogSiteName: string | null;
  title: string | null;
  canonical: string | null;
  ogUrl: string | null;
  ldLogo: string | null;
  appleIcon: string | null;
  icons: { href: string; size: number }[];
  ogImage: string | null;
  ldPhone: string | null;
  telLinks: string[];
  textPhone: string | null;
  ldAddress: string | null;
  visibleAddress: string | null;
  hours: Hours | null;
  socials: { network: string; url: string }[];
  ldDescription: string | null;
  metaDescription: string | null;
  ogDescription: string | null;
  themeColor: string | null;
  cssVars: { primary: string[]; accent: string[] };
  stylesheets: string[];
  inlineCss: string;
  ldServices: ServiceGuess[];
  priceServices: ServiceGuess[];
  ldTypes: string[];
  text: string;
  links: { href: string; text: string }[];
}

export function extractPage(html: string, url: string): PageFacts {
  const nodes = jsonLdNodes(html);
  const biz = businessNode(nodes);
  const org = orgNode(nodes);
  const metas = tags(html, "meta");
  const meta = (k: string) => clean(metas.find((m) => (m.property ?? m.name ?? "").toLowerCase() === k)?.content ?? "") || null;
  const links = tags(html, "link");
  const rel = (l: Attrs) => (l.rel ?? "").toLowerCase().split(/\s+/);
  const titleM = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const anchors = [...html.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)].map((m) => ({ attrs: parseAttrs(/<a\b[^>]*>/i.exec(m[0])![0]), text: textOf(m[1]!).slice(0, 80) }));
  const inlineCss = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]!).join("\n").slice(0, 400_000) + "\n" + tags(html, "html").concat(tags(html, "body")).map((a) => a.style ?? "").join(";");
  const icons = links
    .filter((l) => rel(l).includes("icon") && !rel(l).includes("mask-icon"))
    .map((l) => ({ href: abs(l.href, url), size: Math.max(0, ...(l.sizes ?? "").split(/\s+/).map((s) => parseInt(s, 10) || 0)) }))
    .filter((i): i is { href: string; size: number } => !!i.href);
  const socials = [
    ...anchors.map((a) => abs(a.attrs.href, url)).filter((h): h is string => !!h),
    ...[biz?.sameAs, org?.sameAs].flatMap((s) => (Array.isArray(s) ? s : s ? [s] : [])).filter((s): s is string => typeof s === "string"),
  ]
    .map(socialOf)
    .filter((s): s is { network: string; url: string } => !!s);
  const ldTypes = nodes.flatMap(typesOf);
  return {
    url,
    ldName: str(biz?.name) ?? str(org?.name),
    ogSiteName: meta("og:site_name"),
    title: titleM ? clean(titleM[1]!) : null,
    canonical: abs(links.find((l) => rel(l).includes("canonical"))?.href, url),
    ogUrl: abs(meta("og:url") ?? undefined, url),
    ldLogo: abs(imageUrl(biz?.logo) ?? imageUrl(org?.logo) ?? undefined, url),
    appleIcon: abs(links.find((l) => rel(l).some((r) => r.startsWith("apple-touch-icon")))?.href, url),
    icons,
    ogImage: abs(meta("og:image") ?? meta("og:image:url") ?? meta("twitter:image") ?? undefined, url),
    ldPhone: str(biz?.telephone),
    telLinks: anchors.map((a) => a.attrs.href ?? "").filter((h) => /^tel:/i.test(h)),
    textPhone: PHONE_TEXT.exec(textOf(html))?.[0] ?? null,
    ldAddress: jsonLdAddress(biz?.address),
    visibleAddress: visibleAddress(html),
    hours: biz ? jsonLdHours(biz) : null,
    socials,
    ldDescription: str(biz?.description) ?? str(org?.description),
    metaDescription: meta("description"),
    ogDescription: meta("og:description"),
    themeColor: meta("theme-color"),
    cssVars: cssVarColors(inlineCss),
    stylesheets: links.filter((l) => rel(l).includes("stylesheet") && !/print/i.test(l.media ?? "")).map((l) => abs(l.href, url)).filter((h): h is string => !!h),
    inlineCss,
    ldServices: jsonLdServices(nodes),
    priceServices: priceListServices(html),
    ldTypes,
    text: textOf(html).slice(0, 60_000),
    links: anchors.map((a) => ({ href: abs(a.attrs.href, url) ?? "", text: a.text })).filter((a) => a.href),
  };
}

/** Same-site pages worth a look (contact, about, services, menu, book), best first, at most `max`. */
export function pickSubpages(facts: PageFacts, max = 3): string[] {
  const home = new URL(facts.url);
  const site = (h: string) => h.toLowerCase().replace(/^www\./, "");
  const want: [RegExp, number][] = [[/contact|location|visit|find-us|hours/i, 5], [/services|prices|pricing|price-list|treatments|menu/i, 4], [/book|appointments?|reserve/i, 3], [/about|our-story|story/i, 2]];
  const scored = new Map<string, number>();
  for (const l of facts.links) {
    let u: URL;
    try {
      u = new URL(l.href);
    } catch {
      continue;
    }
    if (site(u.hostname) !== site(home.hostname) || !/^https?:$/.test(u.protocol)) continue;
    u.hash = "";
    if (u.pathname === "/" || u.pathname === home.pathname || /\.(pdf|jpe?g|png|gif|zip|webp|svg)$/i.test(u.pathname)) continue;
    const key = `${u.pathname} ${l.text}`;
    const score = Math.max(0, ...want.map(([re, s]) => (re.test(key) ? s : 0)));
    if (score > 0) scored.set(u.toString(), Math.max(score, scored.get(u.toString()) ?? 0));
  }
  return [...scored.entries()].sort((a, b) => b[1] - a[1]).slice(0, max).map(([u]) => u);
}
