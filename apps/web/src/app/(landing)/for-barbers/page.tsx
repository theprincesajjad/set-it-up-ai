import type { Metadata } from "next";
import { SoloLanding } from "@/components/marketing/SoloLanding";
import { copy } from "@/copy/en-CA";

// Static: the page reads no request data (?src= is read by the start form in the browser).
export const dynamic = "force-static";

export const metadata: Metadata = {
  title: copy.solo.barber.title,
  description: copy.solo.barber.description,
  alternates: { canonical: "/for-barbers" },
  openGraph: { title: copy.solo.barber.title, description: copy.solo.barber.description },
};

export default function ForBarbersPage() {
  return <SoloLanding id="barber" />;
}
