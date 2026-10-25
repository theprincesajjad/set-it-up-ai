import { MapPin } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { LocaleScope } from "@/lib/i18n";
import { getLocale, getT } from "@/lib/i18n/server";

/** notFound() inside the pass group: the layout already supplies <main> and the footer, so only the message is rendered (the root not-found is for unmatched URLs). */
export default async function PassNotFound() {
  const [locale, t] = await Promise.all([getLocale(), getT()]);
  return (
    <LocaleScope locale={locale} className="py-12">
      <EmptyState icon={MapPin} title={t("auth.notFound.title")} description={t("auth.notFound.body")} action={<Button href="/map">{t("auth.notFound.find")}</Button>} secondaryAction={<Button variant="ghost" href="/">{t("auth.notFound.home")}</Button>} />
    </LocaleScope>
  );
}
