import { MapPin, Link2Off, Scissors } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { NotFoundTitle, currentNotFoundContext } from "@/components/errors/NotFoundCard";
import { NOT_FOUND_KEYS } from "@/components/errors/notFoundCopy";
import { LocaleScope } from "@/lib/i18n";
import { getLocale, getT } from "@/lib/i18n/server";

/**
 * notFound() inside the pass group: the layout already supplies <main> and the footer, so only the message is rendered. The words follow what
 * was asked for (that shop, this link, your place in line, a neighbourhood event) and the h1 is the title. A link cut off by a text message
 * says so and tells the person to copy the whole link.
 */
export default async function PassNotFound() {
  const [locale, t, ctx] = await Promise.all([getLocale(), getT(), currentNotFoundContext()]);
  const keys = NOT_FOUND_KEYS[ctx];
  const icon = ctx === "cut" ? Scissors : ctx === "link" || ctx === "line" ? Link2Off : MapPin;
  return (
    <LocaleScope locale={locale} className="py-12">
      <NotFoundTitle />
      <EmptyState
        icon={icon}
        headingLevel={1}
        title={t(keys.title)}
        description={t(keys.body)}
        action={<Button href="/map">{t("auth.notFound.find")}</Button>}
        secondaryAction={
          <Button variant="ghost" href="/">
            {t("err.action.home")}
          </Button>
        }
      />
    </LocaleScope>
  );
}
