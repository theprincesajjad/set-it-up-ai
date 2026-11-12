import { SOLO_OG_PAGES, soloOgImage, type SoloOgPage } from "@/lib/marketing/solo-og";

/**
 * The trade pages' share cards (/og/solo/nail, /barber, /groom), linked from their metadata (soloSocial). They live here, not beside the
 * pages as opengraph-image files: there the [variant] routes and the A/B rewrite (proxy.ts) answered 404 for the card and the pages
 * shipped no og:image at all. Prerendered; the proxy leaves /og alone.
 */
export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return SOLO_OG_PAGES.map((page) => ({ page }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ page: string }> }) {
  const { page } = await params;
  if (!(SOLO_OG_PAGES as readonly string[]).includes(page)) return new Response("Not found", { status: 404 });
  return soloOgImage(page as SoloOgPage);
}
