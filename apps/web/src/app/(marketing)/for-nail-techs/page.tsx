import type { Metadata } from "next";
import { SoloLanding } from "@/components/marketing/SoloLanding";
import { copy } from "@/copy/en-CA";
import { soloLocale } from "@/lib/marketing/solo-locale";
import { nailTrade } from "@/lib/marketing/solo";

// The language and ?trade= come from the request, so the page renders per request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: copy.solo.nail.title,
  description: copy.solo.nail.description,
  alternates: { canonical: "/for-nail-techs" },
  openGraph: { title: copy.solo.nail.title, description: copy.solo.nail.description },
};

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** /for-nail-techs, with ?trade=brows|lashes|makeup swapping the hero and the sample services. */
export default async function ForNailTechsPage({ searchParams }: Props) {
  const sp = await searchParams;
  return <SoloLanding id="nail" locale={await soloLocale(sp)} trade={nailTrade(sp.trade)} />;
}
