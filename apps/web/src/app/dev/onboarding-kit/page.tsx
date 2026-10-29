import type { Metadata } from "next";
import { LocaleScope } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import { KitDemo } from "./KitDemo";

export const metadata: Metadata = { title: "Onboarding kit", robots: { index: false, follow: false } };

/** Storybook-free demo of the onboarding components (docs/design/onboarding-v1.md section 5). `?theme=clear-dark`, `?lang=ur`, `?trade=salon`. */
export default async function OnboardingKitPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const locale = await getLocale(sp);
  return (
    <LocaleScope locale={locale} trade={sp.trade ?? "salon"}>
      <main id="main" className="min-h-dvh bg-background px-4 py-8 text-foreground">
        <KitDemo locale={locale} trade={sp.trade ?? "salon"} />
      </main>
    </LocaleScope>
  );
}
