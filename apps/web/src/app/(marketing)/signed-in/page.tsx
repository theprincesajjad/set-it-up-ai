import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageFrame } from "@/components/restaurant/PageFrame";
import { SignedInNotice } from "@/components/auth/SignedInNotice";
import { roleHome } from "@/lib/auth/home";
import { requireMe } from "@/lib/auth/session";
import { getLocale } from "@/lib/i18n/server";
import { preloadInter } from "@/lib/fonts/inter";

export const metadata: Metadata = { title: "Signed in", robots: { index: false, follow: false } };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** Signed in, but the account has no shop, console or BIA role: say so and offer the next steps (never a silent jump into the signup wizard). */
export default async function SignedInPage({ searchParams }: Props) {
  preloadInter();
  const sp = await searchParams;
  const me = await requireMe("/signed-in");
  const home = roleHome(me);
  if (home) redirect(home);
  const locale = await getLocale(sp);
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 px-4 py-16">
      <PageFrame locale={locale} className="flex flex-col gap-6">
        <SignedInNotice />
      </PageFrame>
    </main>
  );
}
