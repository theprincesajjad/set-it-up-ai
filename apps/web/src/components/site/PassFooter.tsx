import Link from "next/link";
import { BRAND } from "@ll/shared";
import { LocaleScope } from "@/lib/i18n";
import { getLocale, getT } from "@/lib/i18n/server";
import { LogoMark } from "./Brand";

/** Public pages: the shop is the hero; our brand only appears here, quietly. In the visitor's language (?lang= → cookie → Accept-Language). */
export async function PassFooter() {
  const [locale, t] = await Promise.all([getLocale(), getT()]);
  return (
    <LocaleScope locale={locale}>
      <footer className="mx-auto mt-12 flex w-full max-w-[480px] flex-col items-center gap-2 border-t border-line px-4 pt-6 pb-10 text-center">
        <Link href="/for-shoppers" className="inline-flex items-center gap-2 text-meta text-fg-muted hover:text-fg">
          <LogoMark size={16} />
          <span>{t("auth.footer.part", { brand: BRAND.name })}</span>
        </Link>
        <p className="flex gap-3 text-meta text-fg-muted">
          <Link href="/legal/terms" className="hover:text-fg">
            {t("auth.footer.terms")}
          </Link>
          <Link href="/legal/privacy" className="hover:text-fg">
            {t("auth.footer.privacy")}
          </Link>
          <Link href="/legal/rewards" className="hover:text-fg">
            {t("auth.footer.rewards")}
          </Link>
        </p>
      </footer>
    </LocaleScope>
  );
}
