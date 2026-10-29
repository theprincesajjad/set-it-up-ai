import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SoloLanding } from "@/components/marketing/SoloLanding";
import { LandingMeasure } from "@/components/marketing/landing-ab/LandingMeasure";
import { copy } from "@/copy/en-CA";
import { variantIds } from "@/lib/marketing/landing-variants";

/** Every A/B variant of /for-barbers, prerendered and served by the proxy's rewrite (see for-nail-techs/[trade]/[variant]). */
export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return variantIds("barber").map((variant) => ({ variant }));
}

export const metadata: Metadata = {
  title: copy.solo.barber.title,
  description: copy.solo.barber.description,
  alternates: { canonical: "/for-barbers" },
  openGraph: { title: copy.solo.barber.title, description: copy.solo.barber.description },
};

export default async function BarberVariantPage({ params }: PageProps<"/for-barbers/[variant]">) {
  const { variant } = await params;
  if (!variantIds("barber").includes(variant)) notFound();
  return (
    <>
      <SoloLanding id="barber" variant={variant} />
      <LandingMeasure path="/for-barbers" />
    </>
  );
}
