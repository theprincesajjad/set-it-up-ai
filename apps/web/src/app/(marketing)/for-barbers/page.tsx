import type { Metadata } from "next";
import { SoloLanding } from "@/components/marketing/SoloLanding";
import { copy } from "@/copy/en-CA";
import { soloLocale } from "@/lib/marketing/solo-locale";

// The language comes from ?lang= or the saved cookie, so the page renders per request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: copy.solo.barber.title,
  description: copy.solo.barber.description,
  alternates: { canonical: "/for-barbers" },
  openGraph: { title: copy.solo.barber.title, description: copy.solo.barber.description },
};

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function ForBarbersPage({ searchParams }: Props) {
  return <SoloLanding id="barber" locale={await soloLocale(await searchParams)} />;
}
