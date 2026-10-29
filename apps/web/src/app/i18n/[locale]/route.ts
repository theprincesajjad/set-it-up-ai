import { CATALOGS, normalizeLocale } from "@ll/shared";

/**
 * GET /i18n/<locale>: one language's message catalogue as JSON, prerendered at build. The browser fetches only the visitor's
 * language (lib/i18n/catalog.ts); LocaleScope preloads it with the HTML, so hydration does not wait on a second round trip.
 * URLs carry `?v=<hash of the catalogue>` (lib/i18n/catalogVersion.ts), so the response can be cached for good.
 */
export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(CATALOGS).map((locale) => ({ locale }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ locale: string }> }) {
  const locale = normalizeLocale((await params).locale);
  if (!locale) return new Response("Not found", { status: 404 });
  return Response.json(CATALOGS[locale], { headers: { "cache-control": "public, max-age=31536000, immutable" } });
}
