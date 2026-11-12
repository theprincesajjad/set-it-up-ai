import type { Metadata } from "next";
import { SoloLanding } from "@/components/marketing/SoloLanding";
import { copy } from "@/copy/en-CA";
import { soloSocial } from "@/lib/marketing/solo-og";

// Static: the page reads no request data (?src= is read by the start form in the browser).
export const dynamic = "force-static";

export const metadata: Metadata = {
  title: copy.solo.groom.title,
  description: copy.solo.groom.description,
  alternates: { canonical: "/for-groomers" },
  ...soloSocial("groom", { title: copy.solo.groom.title, description: copy.solo.groom.description, path: "/for-groomers" }),
};

export default function ForGroomersPage() {
  return <SoloLanding id="groom" />;
}
