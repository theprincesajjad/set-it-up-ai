/**
 * "Already booking somewhere else?" (onboarding-v1.md §3.6). A pro pastes her Linktree, Beacons, Fresha or Booksy link; we fetch
 * that one public page server-side and show the links on it and, for Fresha and Booksy, the services and prices it lists, as a
 * checklist to add. Nothing else is ever fetched: four hosts only (and their www.), https only, no cookies or login, a 5-second
 * timeout, at most 1.5 MB, redirects followed only to the same allow-list. instagram.com is never fetched (there is no official way
 * to read a profile without login, and we do not scrape it).
 */
import type { merchantApi } from "@ll/shared";
import { HttpError, badRequest } from "../lib/errors.js";

export const IMPORT_HOSTS = ["linktr.ee", "beacons.ai", "fresha.com", "booksy.com"] as const;
export type ImportHost = (typeof IMPORT_HOSTS)[number];
const TIMEOUT_MS = 5000;
const MAX_BYTES = 1_500_000;
const MAX_REDIRECTS = 3;

/** The allow-listed host a URL belongs to, or null. Only https, only the four hosts or their `www.`, no credentials or odd ports. */
export function allowedImportHost(raw: string): ImportHost | null {
  let u: URL;
  try {
    u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || u.username || u.password || (u.port && u.port !== "443")) return null;
  const host = u.hostname.toLowerCase().replace(/\.$/, "");
  for (const h of IMPORT_HOSTS) if (host === h || host === `www.${h}`) return h;
  return null;
}

export function normalizeImportUrl(raw: string): string {
  const s = raw.trim();
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`;
}

async function fetchPage(url: string, f: typeof fetch): Promise<string> {
  let next = url;
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    if (!allowedImportHost(next)) throw badRequest("We can only read Linktree, Beacons, Fresha and Booksy pages.");
    const res = await f(next, { redirect: "manual", credentials: "omit", headers: { "User-Agent": "LocalLoyaltyLinkImport/1.0 (+https://localloyalty.ca)", Accept: "text/html" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) break;
      next = new URL(loc, next).toString();
      continue;
    }
    if (!res.ok) throw badRequest("That page didn't open. Check the link and try again.");
    const len = Number(res.headers.get("content-length") ?? 0);
    if (len > MAX_BYTES) throw badRequest("That page is too big to read.");
    const text = await res.text();
    return text.slice(0, MAX_BYTES);
  }
  throw badRequest("That page didn't open. Check the link and try again.");
}

const decode = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim();

/** Every JSON blob a page carries for itself: JSON-LD and Next.js page data. */
function jsonBlobs(html: string): unknown[] {
  const out: unknown[] = [];
  const re = /<script[^>]*type=["'](application\/ld\+json|application\/json)["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    try {
      out.push(JSON.parse(m[2]!));
    } catch {
      /* not JSON */
    }
  }
  return out;
}

function walk(v: unknown, visit: (o: Record<string, unknown>) => void, depth = 0) {
  if (depth > 14 || v == null || typeof v !== "object") return;
  if (Array.isArray(v)) {
    for (const x of v.slice(0, 500)) walk(x, visit, depth + 1);
    return;
  }
  visit(v as Record<string, unknown>);
  for (const x of Object.values(v as Record<string, unknown>).slice(0, 200)) walk(x, visit, depth + 1);
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? decode(v) : null);

function priceCentsOf(o: Record<string, unknown>): number | null {
  const offer = (o.offers && typeof o.offers === "object" ? (Array.isArray(o.offers) ? o.offers[0] : o.offers) : null) as Record<string, unknown> | null;
  const raw = o.price ?? o.priceValue ?? o.price_amount ?? o.amount ?? offer?.price ?? (o.priceRange as Record<string, unknown> | undefined)?.from;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw >= 1000 && Number.isInteger(raw) && "priceCents" in o ? raw : Math.round(raw * 100);
  if (typeof raw === "string") {
    const n = Number(raw.replace(/[^0-9.]/g, ""));
    return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
  }
  if (typeof o.priceCents === "number") return o.priceCents;
  return null;
}

function durationOf(o: Record<string, unknown>): number | null {
  const d = o.duration ?? o.durationMin ?? o.duration_minutes ?? o.durationInMinutes;
  if (typeof d === "number" && d > 0 && d <= 720) return Math.round(d > 720 ? d / 60 : d);
  if (typeof d === "string") {
    const iso = /^PT(?:(\d+)H)?(?:(\d+)M)?$/i.exec(d);
    if (iso) return Number(iso[1] ?? 0) * 60 + Number(iso[2] ?? 0) || null;
    const n = /(\d+)\s*min/i.exec(d);
    if (n) return Number(n[1]);
  }
  return null;
}

/** Read a fetched page: its outbound links, and (Fresha, Booksy) the services with prices found in its own data. */
export function parseImportPage(host: ImportHost, html: string, pageUrl: string): merchantApi.ImportLinkResponse {
  const links = new Map<string, string>();
  const services = new Map<string, { name: string; priceCents: number | null; durationMin: number | null }>();
  const addLink = (title: string | null, url: string | null) => {
    if (!url || !/^https?:\/\//i.test(url) || links.size >= 30) return;
    try {
      const u = new URL(url);
      if (u.hostname === new URL(pageUrl).hostname) return;
      if (!links.has(u.toString())) links.set(u.toString(), title?.slice(0, 120) || u.hostname);
    } catch {
      /* skip */
    }
  };
  for (const blob of jsonBlobs(html)) {
    walk(blob, (o) => {
      // Linktree and Beacons keep their buttons as { title, url } in the page data.
      const url = str(o.url) ?? str(o.href);
      const title = str(o.title) ?? str(o.label);
      if (url && title && (host === "linktr.ee" || host === "beacons.ai")) addLink(title, url);
      if (host === "fresha.com" || host === "booksy.com") {
        const name = str(o.name) ?? str(o.title);
        const type = typeof o["@type"] === "string" ? (o["@type"] as string) : "";
        const price = priceCentsOf(o);
        if (name && name.length <= 120 && (price !== null || /service|offer/i.test(type)) && !/^(LocalBusiness|Organization|BeautySalon|HealthAndBeautyBusiness|Place|PostalAddress)$/i.test(type) && services.size < 60) {
          const key = name.toLowerCase();
          if (!services.has(key)) services.set(key, { name, priceCents: price, durationMin: durationOf(o) });
        }
      }
    });
  }
  // Plain anchors, for pages without data blobs.
  const re = /<a\b[^>]*href=["'](https?:\/\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (let m = re.exec(html); m; m = re.exec(html)) addLink(decode(m[2]!.replace(/<[^>]+>/g, " ")) || null, decode(m[1]!));
  return { host, links: [...links.entries()].map(([url, title]) => ({ title, url })), services: [...services.values()] };
}

/** POST /onboarding/import-link. `f` is injectable for tests. */
export async function importLink(raw: string, f: typeof fetch = fetch): Promise<merchantApi.ImportLinkResponse> {
  const host = allowedImportHost(raw);
  if (!host) throw badRequest("We can only read Linktree, Beacons, Fresha and Booksy pages.");
  const url = normalizeImportUrl(raw);
  let html: string;
  try {
    html = await fetchPage(url, f);
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw badRequest("That page didn't open. Check the link and try again.");
  }
  return parseImportPage(host, html, url);
}
