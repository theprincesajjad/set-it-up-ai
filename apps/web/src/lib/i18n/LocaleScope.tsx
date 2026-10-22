import type { ReactNode } from "react";
import { LOCALES, type Locale } from "@ll/shared";
import { cn } from "@/lib/cn";
import { LocaleProvider } from "./client";
import { localeFont } from "./fonts";

/**
 * Server wrapper for a localized subtree: sets `lang` + `dir`, loads the Noto font for non-Latin locales
 * and provides `useLocale()` to client components below. Use logical CSS (ms/me/ps/pe, text-start) inside.
 */
export function LocaleScope({ locale, className, children }: { locale: Locale; className?: string; children: ReactNode }) {
  const info = LOCALES[locale];
  const font = localeFont(locale);
  return (
    <div lang={info.bcp47} dir={info.dir} className={cn(font.className, locale === "ur" && "leading-loose", className)} style={font.fontFamily ? { fontFamily: font.fontFamily } : undefined}>
      <LocaleProvider locale={locale}>{children}</LocaleProvider>
    </div>
  );
}
