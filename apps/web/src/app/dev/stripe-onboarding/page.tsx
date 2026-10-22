import type { Metadata } from "next";
import { DevSimulate } from "@/components/dashboard/DevSimulate";

export const metadata: Metadata = { title: "Test payouts setup", robots: { index: false, follow: false } };

export default async function DevOnboarding({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  return <DevSimulate title="Test Stripe setup" body="This simulates finishing Stripe Express onboarding (charges and payouts enabled)." action="complete_onboarding" id={sp.account ?? null} cta="Finish test setup" returnTo={sp.return_url ?? null} />;
}
