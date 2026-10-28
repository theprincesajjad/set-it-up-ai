import type { ReactNode } from "react";
import { LOCALES, type Locale } from "@ll/shared";
import { cn } from "@/lib/cn";
import { HtmlLocale } from "./HtmlLocale";
import { LocaleProvider } from "./client";

/**
 * Server wrapper for a localized subtree: sets `lang` + `dir` (the Noto font for the script follows from `[lang]` in globals.css)
 * and provides `useLocale()` to client components below. It also mirrors `lang` and `dir` onto <html>, so dialogs, menus and
 * toasts that portal out of this div read right to left and use the right font too. Use logical CSS (ms/me/ps/pe, text-start) inside.
 */
export function LocaleScope({ locale, className, children }: { locale: Locale; className?: string; children: ReactNode }) {
  const info = LOCALES[locale];
  return (
    <div lang={info.bcp47} dir={info.dir} className={cn(locale === "ur" && "leading-loose", className)}>
      <HtmlLocale lang={info.bcp47} dir={info.dir} />
      <LocaleProvider locale={locale}>{children}</LocaleProvider>
    </div>
  );
}
