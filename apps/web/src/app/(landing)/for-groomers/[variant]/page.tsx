import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SoloLanding } from "@/components/marketing/SoloLanding";
import { LandingMeasure } from "@/components/marketing/landing-ab/LandingMeasure";
import { copy } from "@/copy/en-CA";
import { variantIds } from "@/lib/marketing/landing-variants";

/** Every A/B variant of /for-groomers, prerendered and served by the proxy's rewrite (see for-nail-techs/[trade]/[variant]). */
export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return variantIds("groom").map((variant) => ({ variant }));
}

export const metadata: Metadata = {
  title: copy.solo.groom.title,
  description: copy.solo.groom.description,
  alternates: { canonical: "/for-groomers" },
  openGraph: { title: copy.solo.groom.title, description: copy.solo.groom.description },
};

export default async function GroomerVariantPage({ params }: PageProps<"/for-groomers/[variant]">) {
  const { variant } = await params;
  if (!variantIds("groom").includes(variant)) notFound();
  return (
    <>
      <SoloLanding id="groom" variant={variant} />
      <LandingMeasure path="/for-groomers" />
    </>
  );
}
