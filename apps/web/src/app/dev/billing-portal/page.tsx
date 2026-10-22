import type { Metadata } from "next";
import { DevSimulate } from "@/components/dashboard/DevSimulate";

export const metadata: Metadata = { title: "Test billing portal", robots: { index: false, follow: false } };

export default async function DevPortal({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  return <DevSimulate title="Test billing portal" body="In production this is Stripe's portal for cards and invoices." action={null} id={null} cta="Back to billing" returnTo={sp.return_url ?? null} />;
}
