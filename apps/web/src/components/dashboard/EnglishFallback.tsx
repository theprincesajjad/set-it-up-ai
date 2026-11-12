"use client";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { LocaleProvider, useLocaleOrEnglish } from "@/lib/i18n/client";
import { Banner } from "@/components/ui/Banner";

/**
 * Trade screens that are written in English only (a restaurant's pre-orders and catering, a grocer's counter, class schedules, the queue...).
 * In Hindi, Urdu or Punjabi they must not render English sentences inside a right-to-left page (full stops land at the start, numbers
 * reorder), so they are shown as a clean left-to-right English page with one translated line that says so. Add a prefix to the
 * translated list below the day a screen is translated.
 */
const ENGLISH_ONLY = ["restaurant", "grocery", "classes", "queue", "daycare", "wash", "tire-season", "pets", "vehicles", "pharmacy", "tickets", "slots", "orders", "invoices", "payouts", "service-reminders", "food-cards", "discount-cards", "groom-rebooking"];
/** Under an English-only prefix, the screens that are translated. */
const TRANSLATED = ["restaurant/kitchen", "classes/door"];

export function isEnglishOnlyScreen(pathname: string, base: string): boolean {
  const rest = pathname.startsWith(base) ? pathname.slice(base.length).replace(/^\/+|\/+$/g, "") : "";
  const hit = (p: string) => rest === p || rest.startsWith(`${p}/`);
  return ENGLISH_ONLY.some(hit) && !TRANSLATED.some(hit);
}

export function EnglishFallback({ base, children }: { base: string; children: ReactNode }) {
  const { locale, t } = useLocaleOrEnglish();
  const pathname = usePathname() ?? "";
  if (locale === "en" || !isEnglishOnlyScreen(pathname, base)) return <>{children}</>;
  return (
    <>
      <Banner tone="info">{t("dash.englishOnly")}</Banner>
      <div lang="en" dir="ltr" data-english-screen="" className="mt-4 font-sans leading-normal">
        <LocaleProvider locale="en">{children}</LocaleProvider>
      </div>
    </>
  );
}
