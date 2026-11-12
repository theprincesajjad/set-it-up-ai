"use client";
import Link from "next/link";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { buttonClasses } from "@/components/ui/Button";
import { useLocaleOrEnglish } from "@/lib/i18n/client";

/** Signed in with no shop, console or BIA role: what happened and the three ways forward. */
export function SignedInNotice() {
  const { t } = useLocaleOrEnglish();
  return (
    <>
      <h1 className="display text-mkt-sm text-balance">{t("auth.signedIn.title")}</h1>
      <p className="text-body text-muted-foreground">{t("auth.signedIn.body")}</p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Link href="/signup" className={buttonClasses({ size: "lg" })}>
          {t("auth.signedIn.setup")}
        </Link>
        <Link href="/me" className={buttonClasses({ size: "lg", variant: "secondary" })}>
          {t("auth.signedIn.wallet")}
        </Link>
        <SignOutButton variant="ghost" switching />
      </div>
    </>
  );
}
