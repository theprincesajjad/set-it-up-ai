import type { Metadata } from "next";
import Link from "next/link";
import { SignupWizard } from "@/components/auth/SignupWizard";
import { Container } from "@/components/ui/Layout";
import { copy } from "@/copy/en-CA";
import { publicServerApi } from "@/lib/api/server";
import { getMe } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Get started free", description: "Set up a free loyalty program for your shop in minutes.", alternates: { canonical: "/signup" } };

export default async function SignupPage() {
  const [me, hoods] = await Promise.all([getMe(), publicServerApi().network.neighbourhoods().then((r) => r.items).catch(() => [])]);
  return (
    <Container size="public" className="py-10 md:py-16">
      <p className="text-overline uppercase text-fg-brand">{copy.misc.freeForever}</p>
      <h1 className="mt-2 text-h1 text-fg">Get your shop on the street&apos;s card</h1>
      <p className="mt-2 mb-8 text-body text-fg-muted">About 5 minutes. Prefer a hand? <Link href="/#book" className="text-fg-link underline">Book a free 20-minute visit</Link>.</p>
      <SignupWizard signedInName={me ? me.user.name ?? me.user.email ?? "there" : null} neighbourhoods={hoods} />
    </Container>
  );
}
