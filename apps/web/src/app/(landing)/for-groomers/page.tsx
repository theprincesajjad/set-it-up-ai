import type { Metadata } from "next";
import { SoloLanding } from "@/components/marketing/SoloLanding";
import { copy } from "@/copy/en-CA";

// Static: the page reads no request data (?src= is read by the start form in the browser).
export const dynamic = "force-static";

export const metadata: Metadata = {
  title: copy.solo.groom.title,
  description: copy.solo.groom.description,
  alternates: { canonical: "/for-groomers" },
  openGraph: { title: copy.solo.groom.title, description: copy.solo.groom.description },
};

export default function ForGroomersPage() {
  return <SoloLanding id="groom" />;
}
