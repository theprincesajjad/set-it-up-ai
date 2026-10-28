import type { Metadata } from "next";
import Link from "next/link";
import { SignupWizard } from "@/components/auth/SignupWizard";
import { Container } from "@/components/ui/Layout";
import { copy } from "@/copy/en-CA";
import { getMe } from "@/lib/auth/session";
import { signupPrefill } from "@/lib/marketing/signupPrefill";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Get started free", description: "Set up a free loyalty program for your shop in minutes.", alternates: { canonical: "/signup" } };

export default async function SignupPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const prefill = signupPrefill(await searchParams);
  const me = await getMe();
  return (
    <Container size="public" className="py-12 md:py-20">
      <p className="text-meta-strong text-muted-foreground">{copy.misc.freeForever}</p>
      <h1 className="display mt-4 text-mkt-sm text-balance md:text-mkt-md">get your shop on the street&apos;s card.</h1>
      <p className="mt-3 mb-10 text-body text-muted-foreground">About a minute. Prefer a hand? <Link href="/#book" className="font-semibold text-foreground underline decoration-input/60 underline-offset-2">Book a free 20-minute visit</Link>.</p>
      <SignupWizard prefill={prefill} signedInName={me ? me.user.name ?? me.user.email ?? "there" : null} />
    </Container>
  );
}
