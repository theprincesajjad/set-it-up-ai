import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SoloLanding } from "@/components/marketing/SoloLanding";
import { copy } from "@/copy/en-CA";
import { NAIL_TRADES, type NailTrade } from "@/lib/marketing/solo";

/** The other looks of the nail page, prerendered. Public URL: /for-nail-techs?trade=<trade> (rewritten here in next.config.ts). */
const LOOKS = NAIL_TRADES.filter((t): t is Exclude<NailTrade, "nails"> => t !== "nails");

// Static, like the other solo pages (the root not-found reads the request, which would otherwise make this route dynamic).
export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return LOOKS.map((trade) => ({ trade }));
}

const isLook = (t: string): t is Exclude<NailTrade, "nails"> => (LOOKS as string[]).includes(t);

export async function generateMetadata({ params }: PageProps<"/for-nail-techs/[trade]">): Promise<Metadata> {
  const { trade } = await params;
  if (!isLook(trade)) return {};
  const m = copy.solo[trade];
  return { title: m.title, description: m.description, alternates: { canonical: `/for-nail-techs?trade=${trade}` }, openGraph: { title: m.title, description: m.description } };
}

export default async function ForNailTechsLookPage({ params }: PageProps<"/for-nail-techs/[trade]">) {
  const { trade } = await params;
  if (!isLook(trade)) notFound();
  return <SoloLanding id="nail" trade={trade} />;
}
