import { MapPin } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { PassFooter } from "@/components/site/PassFooter";
// Direct import: the "@/lib/i18n" barrel also brings the client LanguageSwitcher into every page that renders this.
import { LocaleScope } from "@/lib/i18n/LocaleScope";
import { getLocale, getT } from "@/lib/i18n/server";

export default async function NotFound() {
  const [locale, t] = await Promise.all([getLocale(), getT()]);
  return (
    <>
      <main id="main" className="mx-auto max-w-[480px] px-4 py-16">
        <LocaleScope locale={locale} lazyCatalog>
          <EmptyState icon={MapPin} className="pb-4" title={t("auth.notFound.title")} description={t("auth.notFound.body")} action={<Button href="/map">{t("auth.notFound.find")}</Button>} secondaryAction={<Button variant="ghost" href="/">{t("auth.notFound.home")}</Button>} />
          {/* Wave P: a shop owner who mistyped a marketing URL gets a way on too, not only shoppers. */}
          <p className="mt-2 text-center text-meta text-muted-foreground" data-testid="not-found-business">
            {t("auth.notFound.business")}{" "}
            <Link href="/pricing" className="inline-flex min-h-11 items-center font-semibold text-foreground underline decoration-input/60 underline-offset-2">
              {t("auth.notFound.pricing")}
            </Link>
            <span aria-hidden> · </span>
            <Link href="/login" className="inline-flex min-h-11 items-center font-semibold text-foreground underline decoration-input/60 underline-offset-2">
              {t("auth.notFound.signIn")}
            </Link>
          </p>
        </LocaleScope>
      </main>
      <PassFooter lazyCatalog />
    </>
  );
}
