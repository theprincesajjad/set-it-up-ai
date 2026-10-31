import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { PublicSite, siteMetadata } from "@/components/site/presets/PublicSite";
import { publicServerApi } from "@/lib/api/server";
import { SITE_HOST_HEADER } from "@/lib/siteHost";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ domain: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

/** Only a request the proxy rewrote from a custom hostname reaches a site here; any other one-segment path is a plain 404. */
async function hostFor(domain: string): Promise<string | null> {
  const h = (await headers()).get(SITE_HOST_HEADER);
  const d = decodeURIComponent(domain).toLowerCase();
  return h && h === d && d.includes(".") ? d : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const host = await hostFor((await params).domain);
  return host ? siteMetadata({ host }) : {};
}

/**
 * The short link a solo pro puts in their bio (`localloyalty.ca/<slug>`, the setup's `displayLink`): a shop's slug opens its booking
 * page (or its shop page when it takes no bookings). Static routes win over this segment, so only an unknown first segment gets here.
 */
async function shortLinkTarget(segment: string): Promise<string | null> {
  const slug = decodeURIComponent(segment).toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{1,59}$/.test(slug)) return null;
  try {
    const shop = await publicServerApi().public.shop(slug);
    const s = encodeURIComponent(shop.merchant.slug);
    return shop.features?.appointments ? `/shops/${s}/book` : `/shops/${s}`;
  } catch {
    return null;
  }
}

/** A shop's website on its own domain (custom hostname → proxy rewrite → here), or a shop's short link. */
export default async function SiteByHostPage({ params, searchParams }: Props) {
  const [{ domain }, sp] = await Promise.all([params, searchParams]);
  const host = await hostFor(domain);
  if (!host) {
    const target = await shortLinkTarget(domain);
    if (target) redirect(target);
    notFound();
  }
  return <PublicSite lookup={{ host }} searchParams={sp} />;
}
