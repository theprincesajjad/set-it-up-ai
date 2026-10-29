import type { Metadata } from "next";
import { SoloLanding } from "@/components/marketing/SoloLanding";
import { copy } from "@/copy/en-CA";

// Static: the page reads no request data. ?trade=brows|lashes|makeup is rewritten to the static /for-nail-techs/[trade] pages
// (next.config.ts), and ?src= is read by the start form in the browser.
export const dynamic = "force-static";

export const metadata: Metadata = {
  title: copy.solo.nail.title,
  description: copy.solo.nail.description,
  alternates: { canonical: "/for-nail-techs" },
  openGraph: { title: copy.solo.nail.title, description: copy.solo.nail.description },
};

/** /for-nail-techs: the nail tech look. */
export default function ForNailTechsPage() {
  return <SoloLanding id="nail" />;
}
