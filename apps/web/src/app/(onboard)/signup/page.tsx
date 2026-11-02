import type { Metadata } from "next";
import { Suspense } from "react";
import { SignupWizard } from "@/components/auth/SignupWizard";
import { getMe } from "@/lib/auth/session";
import { signupPrefill } from "@/lib/marketing/signupPrefill";
import { LocaleScope } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Get started free", description: "Set up a free loyalty program for your shop in minutes.", alternates: { canonical: "/signup" } };

/**
 * Signup is a focused, stepped flow (wave P): outside the marketing layout, so no site nav, footer or chat bubble compete with the
 * one question on screen. The flow draws its own slim top bar (components/onboarding/signup/Shell.tsx).
 */
export default async function SignupPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const prefill = signupPrefill(sp);
  // The flow reads in the visitor's language (?lang=ur, the language cookie).
  const locale = await getLocale(sp);
  const me = await getMe();
  return (
    <LocaleScope locale={locale}>
      <Suspense fallback={<div className="min-h-dvh bg-bg" />}>
        <SignupWizard prefill={prefill} signedInName={me ? (me.user.name ?? me.user.email ?? "there") : null} />
      </Suspense>
    </LocaleScope>
  );
}
