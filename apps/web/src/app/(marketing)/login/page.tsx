import type { Metadata } from "next";
import Link from "next/link";
import { BRAND } from "@ll/shared";
import { LoginTabs } from "@/components/auth/LoginTabs";
import { Banner } from "@/components/ui/Banner";
import { PageFrame } from "@/components/restaurant/PageFrame";
import { AuthLayout } from "@/components/marketing/AuthLayout";
import { getLocale, getT } from "@/lib/i18n/server";
import { redirect } from "next/navigation";
import { getMe } from "@/lib/auth/session";
import { roleHome } from "@/lib/auth/home";
import { safeNext } from "@/lib/routes";
import { preloadInter } from "@/lib/fonts/inter";

export const metadata: Metadata = { title: "Sign in", alternates: { canonical: "/login" } };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** Customers see this page in their language (?lang= → ll_lang cookie → Accept-Language → en); the shop tab is translated too. */
export default async function LoginPage({ searchParams }: Props) {
  preloadInter();
  const sp = await searchParams;
  const nextRaw = typeof sp.next === "string" ? sp.next : null;
  const next = nextRaw ? safeNext(nextRaw, "/") : null;
  // Already signed in (Back button, stale bookmark): go where they were headed. ?switch=1 keeps the form open for "sign in as someone else".
  if (sp.switch !== "1") {
    // An outage must not stop the sign-in form from showing (getMe throws then).
    const me = await getMe().catch(() => null);
    if (me) redirect(next ?? roleHome(me) ?? "/me");
  }
  const email = typeof sp.email === "string" && sp.email.length <= 254 ? sp.email : undefined;
  const customerPath = !!next && /^\/(me|o\/|shops\/|j\/|join\/|e\/|pay\/)/.test(next);
  const initial = sp.as === "customer" || customerPath ? "customer" : "shop";
  const [locale, t] = await Promise.all([getLocale(sp), getT(sp)]);
  // Say why the person is here: the session ended, or the page they asked for needs a sign-in (admin accounts differ from shop accounts).
  const notice = sp.reason === "expired" ? t("err.session.line") : next && /^\/admin(\/|$)/.test(next) ? t("err.login.admin") : next && /^\/(m|door|rep|bia)(\/|$)/.test(next) ? t("err.login.shop") : null;
  return (
    <AuthLayout>
      <PageFrame locale={locale} className="flex flex-col gap-6">
        <h1 className="display mt-2 text-mkt-sm text-balance md:text-mkt-md">{t("auth.login.title", { brand: BRAND.name })}</h1>
        {notice ? <Banner tone="info">{notice}</Banner> : null}
        <LoginTabs signedOut={sp.signedout === "1"} next={next} initial={initial} reset={sp.reset === "1"} mode={sp.mode === "code" ? "code" : undefined} email={email} devAutofill={process.env.NODE_ENV !== "production" || process.env.OTP_AUTOFILL === "1"} />
        <p className="mt-4 text-meta text-muted-foreground">
          {t("auth.login.newShop")}{" "}
          <Link href="/signup" className="font-semibold text-foreground underline decoration-input/60 underline-offset-2">
            {t("auth.login.getStarted")}
          </Link>
        </p>
      </PageFrame>
    </AuthLayout>
  );
}
