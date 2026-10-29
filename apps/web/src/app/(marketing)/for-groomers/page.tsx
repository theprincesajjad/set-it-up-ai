import type { Metadata } from "next";
import { SoloLanding } from "@/components/marketing/SoloLanding";
import { copy } from "@/copy/en-CA";
import { soloLocale } from "@/lib/marketing/solo-locale";

// The language comes from ?lang= or the saved cookie, so the page renders per request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: copy.solo.groom.title,
  description: copy.solo.groom.description,
  alternates: { canonical: "/for-groomers" },
  openGraph: { title: copy.solo.groom.title, description: copy.solo.groom.description },
};

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function ForGroomersPage({ searchParams }: Props) {
  return <SoloLanding id="groom" locale={await soloLocale(await searchParams)} />;
}
