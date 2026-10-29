import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { PublicSite, siteMetadata } from "@/components/site/presets/PublicSite";
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

/** A shop's website on its own domain (custom hostname → proxy rewrite → here). */
export default async function SiteByHostPage({ params, searchParams }: Props) {
  const [{ domain }, sp] = await Promise.all([params, searchParams]);
  const host = await hostFor(domain);
  if (!host) notFound();
  return <PublicSite lookup={{ host }} searchParams={sp} />;
}
