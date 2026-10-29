import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SoloLanding } from "@/components/marketing/SoloLanding";
import { landingVariant, variantIds } from "@/lib/marketing/landing-variants";
import { NAIL_TRADES, SOLO_PAGES, type NailTrade, type SoloKey, type SoloPageId } from "@/lib/marketing/solo";

/**
 * TEMPORARY variant preview for the founder: `/for-nail-techs?v=yours`, `/for-nail-techs?trade=brows&v=privacy`, `/for-barbers?v=price`,
 * `/for-groomers?v=yours` are rewritten here (next.config.ts) and prerendered. Not indexed. The A/B agent replaces this with real
 * assignment; until then a variant is only seen by someone who has its link.
 */
export const dynamic = "force-static";
export const dynamicParams = false;

const LOOKS: SoloKey[] = ["nails", "brows", "lashes", "makeup", "barber", "groom"];
const page = (look: SoloKey): { id: SoloPageId; trade?: NailTrade } => (look === "barber" || look === "groom" ? { id: look } : { id: "nail", trade: look });
const isLook = (x: string): x is SoloKey => (LOOKS as string[]).includes(x);

export function generateStaticParams() {
  return LOOKS.flatMap((look) => variantIds(look).map((variant) => ({ look, variant })));
}

export async function generateMetadata({ params }: PageProps<"/lp/[look]/[variant]">): Promise<Metadata> {
  const { look } = await params;
  if (!isLook(look)) return {};
  const { id, trade } = page(look);
  const path = SOLO_PAGES[id].path + (trade && trade !== "nails" && (NAIL_TRADES as string[]).includes(trade) ? `?trade=${trade}` : "");
  return { robots: { index: false, follow: false }, alternates: { canonical: path } };
}

export default async function VariantPreview({ params }: PageProps<"/lp/[look]/[variant]">) {
  const { look, variant } = await params;
  if (!isLook(look) || landingVariant(look, variant).id !== variant) notFound();
  const { id, trade } = page(look);
  return <SoloLanding id={id} trade={trade} variant={variant} />;
}
