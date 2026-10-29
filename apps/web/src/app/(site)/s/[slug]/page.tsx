import type { Metadata } from "next";
import { PublicSite, siteMetadata } from "@/components/site/presets/PublicSite";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return siteMetadata({ slug: (await params).slug });
}

/** A shop's built-in website at {siteUrl}/s/<slug> (always on, with or without a custom domain). */
export default async function SiteBySlugPage({ params, searchParams }: Props) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  return <PublicSite lookup={{ slug }} searchParams={sp} />;
}
