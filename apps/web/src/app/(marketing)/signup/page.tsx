import type { Metadata } from "next";
import Link from "next/link";
import { SignupWizard } from "@/components/auth/SignupWizard";
import { AuthLayout } from "@/components/marketing/AuthLayout";
import { copy } from "@/copy/en-CA";
import { getMe } from "@/lib/auth/session";
import { planLine } from "@/lib/marketing/plan-copy";
import { signupPrefill } from "@/lib/marketing/signupPrefill";
import { LocaleScope } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Get started free", description: "Set up a free loyalty program for your shop in minutes.", alternates: { canonical: "/signup" } };

export default async function SignupPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const prefill = signupPrefill(sp);
  // The form reads in the visitor's language (?lang=ur, the language cookie); the page around it is the marketing team's.
  const locale = await getLocale(sp);
  const me = await getMe();
  return (
    <AuthLayout>
      {/* The marketing team's English header: kept left to right, so its full stops stay put on an Urdu page. */}
      <div lang="en" dir="ltr">
        <p className="text-meta-strong text-primary-text">{copy.misc.freeForever}</p>
        <h1 className="display mt-4 text-mkt-sm text-balance md:text-mkt-md">Set up your shop, free.</h1>
        {/* The same promise as the button that brought them here (plan-copy.ts), so the trial is not a surprise later. */}
        <p className="mt-3 mb-10 text-body text-muted-foreground">About a minute. {planLine("priceLine")} Or <Link href="/#book" className="font-semibold text-foreground underline decoration-input/60 underline-offset-2">book a free visit</Link>.</p>
      </div>
      <LocaleScope locale={locale}>
        <SignupWizard prefill={prefill} signedInName={me ? me.user.name ?? me.user.email ?? "there" : null} />
      </LocaleScope>
    </AuthLayout>
  );
}
