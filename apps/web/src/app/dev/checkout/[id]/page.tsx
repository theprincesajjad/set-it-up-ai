import type { Metadata } from "next";
import { DevSimulate } from "@/components/dashboard/DevSimulate";

export const metadata: Metadata = { title: "Test checkout", robots: { index: false, follow: false } };

export default async function DevCheckout({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DevSimulate title="Test checkout" body="Stripe isn't configured on this API, so this simulates a completed subscription checkout. Nothing is charged." action="complete_checkout" id={id} cta="Complete test checkout" returnTo={null} />;
}
