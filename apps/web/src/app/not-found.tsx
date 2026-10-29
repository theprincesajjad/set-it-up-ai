import { MapPin } from "lucide-react";
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
          <EmptyState icon={MapPin} title={t("auth.notFound.title")} description={t("auth.notFound.body")} action={<Button href="/map">{t("auth.notFound.find")}</Button>} secondaryAction={<Button variant="ghost" href="/">{t("auth.notFound.home")}</Button>} />
        </LocaleScope>
      </main>
      <PassFooter lazyCatalog />
    </>
  );
}
