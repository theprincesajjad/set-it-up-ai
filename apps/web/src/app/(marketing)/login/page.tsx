import type { Metadata } from "next";
import Link from "next/link";
import { BRAND } from "@ll/shared";
import { LoginTabs } from "@/components/auth/LoginTabs";
import { PageFrame } from "@/components/restaurant/PageFrame";
import { Container } from "@/components/ui/Layout";
import { getLocale, getT } from "@/lib/i18n/server";
import { safeNext } from "@/lib/routes";

export const metadata: Metadata = { title: "Sign in", alternates: { canonical: "/login" } };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** Customers see this page in their language (?lang= → ll_lang cookie → Accept-Language → en); the shop tab's form stays English. */
export default async function LoginPage({ searchParams }: Props) {
  const sp = await searchParams;
  const nextRaw = typeof sp.next === "string" ? sp.next : null;
  const next = nextRaw ? safeNext(nextRaw, "/") : null;
  const customerPath = !!next && /^\/(me|o\/|shops\/|j\/|join\/|e\/|pay\/)/.test(next);
  const initial = sp.as === "customer" || customerPath ? "customer" : "shop";
  const [locale, t] = await Promise.all([getLocale(sp), getT(sp)]);
  return (
    <Container size="public" className="py-12 md:py-20">
      <PageFrame locale={locale} className="flex flex-col gap-6">
        <h1 className="display mt-2 text-mkt-sm text-balance md:text-mkt-md">{t("auth.login.title", { brand: BRAND.name.toLowerCase() })}</h1>
        <LoginTabs next={next} initial={initial} devAutofill={process.env.NODE_ENV !== "production" || process.env.OTP_AUTOFILL === "1"} />
        <p className="mt-4 text-meta text-muted-foreground">
          {t("auth.login.newShop")}{" "}
          <Link href="/signup" className="font-semibold text-foreground underline decoration-input/60 underline-offset-2">
            {t("auth.login.getStarted")}
          </Link>
        </p>
      </PageFrame>
    </Container>
  );
}
