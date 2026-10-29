import type { ReactNode } from "react";
import { preload } from "react-dom";
import { LOCALES, type Locale } from "@ll/shared";
import { cn } from "@/lib/cn";
import { HtmlLocale } from "./HtmlLocale";
import { catalogHref } from "./catalogVersion";
import { LocaleProvider } from "./client";

/**
 * Server wrapper for a localized subtree: sets `lang` + `dir` (the Noto font for the script follows from `[lang]` in globals.css)
 * and provides `useLocale()` to client components below. It also mirrors `lang` and `dir` onto <html>, so dialogs, menus and
 * toasts that portal out of this div read right to left and use the right font too. Use logical CSS (ms/me/ps/pe, text-start) inside.
 */
export function LocaleScope({ locale, className, trade, lazyCatalog, children }: { locale: Locale; className?: string; /** A shop's vertical: sets `data-trade` so the subtree wears that trade's accent family. */ trade?: string; /** Do not preload the catalogue: the root 404 is in every page's tree but rarely shown. */ lazyCatalog?: boolean; children: ReactNode }) {
  const info = LOCALES[locale];
  // The browser loads this language's catalogue only (never all four); asking for it with the HTML keeps hydration from waiting on it.
  const href = catalogHref(locale);
  if (!lazyCatalog) preload(href, { as: "fetch", crossOrigin: "anonymous" });
  return (
    <div lang={info.bcp47} dir={info.dir} data-trade={trade} className={cn(locale === "ur" && "leading-loose", className)}>
      <HtmlLocale lang={info.bcp47} dir={info.dir} />
      <LocaleProvider locale={locale} catalogHref={href}>
        {children}
      </LocaleProvider>
    </div>
  );
}
