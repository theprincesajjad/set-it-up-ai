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
    <Container size="public" className="py-12 md:py-20">
      <p className="text-meta-strong text-fg-muted">{copy.misc.freeForever}</p>
      <h1 className="display mt-4 text-mkt-sm text-balance md:text-mkt-md">get your shop on the street&apos;s card.</h1>
      <p className="mt-3 mb-10 text-body text-fg-muted">About 2 minutes. Prefer a hand? <Link href="/#book" className="font-semibold text-fg underline decoration-line-strong/60 underline-offset-2">Book a free 20-minute visit</Link>.</p>
      <SignupWizard signedInName={me ? me.user.name ?? me.user.email ?? "there" : null} neighbourhoods={hoods} />
    </Container>
  );
}
