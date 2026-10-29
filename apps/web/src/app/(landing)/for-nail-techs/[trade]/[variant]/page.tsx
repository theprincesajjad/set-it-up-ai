import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SoloLanding } from "@/components/marketing/SoloLanding";
import { LandingMeasure } from "@/components/marketing/landing-ab/LandingMeasure";
import { copy } from "@/copy/en-CA";
import { variantIds } from "@/lib/marketing/landing-variants";
import { NAIL_TRADES, type NailTrade } from "@/lib/marketing/solo";

/**
 * Every A/B variant of every nail-page look, prerendered (ab-spec §3). Internal: the proxy (src/proxy.ts, lib/marketing/landing-assign.ts)
 * rewrites /for-nail-techs[?trade=…] here for a counted visitor, so the public URL never changes. Canonical is the bare URL; a direct
 * fetch gets X-Robots-Tag: noindex from the proxy, and the sitemap lists only the bare URLs.
 */
export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return NAIL_TRADES.flatMap((trade) => variantIds(trade).map((variant) => ({ trade, variant })));
}

const isTrade = (t: string): t is NailTrade => (NAIL_TRADES as readonly string[]).includes(t);
const meta = (t: NailTrade) => (t === "nails" ? copy.solo.nail : copy.solo[t]);
const canonical = (t: NailTrade) => (t === "nails" ? "/for-nail-techs" : `/for-nail-techs?trade=${t}`);

export async function generateMetadata({ params }: PageProps<"/for-nail-techs/[trade]/[variant]">): Promise<Metadata> {
  const { trade } = await params;
  if (!isTrade(trade)) return {};
  const m = meta(trade);
  return { title: m.title, description: m.description, alternates: { canonical: canonical(trade) }, openGraph: { title: m.title, description: m.description } };
}

export default async function NailVariantPage({ params }: PageProps<"/for-nail-techs/[trade]/[variant]">) {
  const { trade, variant } = await params;
  if (!isTrade(trade) || !variantIds(trade).includes(variant)) notFound();
  return (
    <>
      <SoloLanding id="nail" trade={trade} variant={variant} />
      <LandingMeasure path={canonical(trade)} />
    </>
  );
}
