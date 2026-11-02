import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getMe } from "@/lib/auth/session";
import { LocaleScope } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import { KitShowcase } from "./KitShowcase";

export const metadata: Metadata = { title: "Component kit", robots: { index: false, follow: false } };

/**
 * Wave Q component kit: every library component, themed, in its states (scratchpad wave-q/kit.md is the guide). `?lang=ur`, `?theme=clear-dark`,
 * `?trade=nails|cafe|barber...`, `?brand=%23RRGGBB` (a shop brand colour). Open in development, with KIT_SHOWCASE=1, or for a platform admin;
 * a 404 for everyone else in production. Never indexed.
 */
export default async function KitPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (process.env.NODE_ENV === "production" && process.env.KIT_SHOWCASE !== "1") {
    const me = await getMe().catch(() => null);
    if (me?.platformRole !== "admin") notFound();
  }
  const sp = await searchParams;
  const locale = await getLocale(sp);
  const trade = sp.trade ?? "nails";
  const brand = sp.brand && /^#?[0-9a-f]{6}$/i.test(sp.brand) ? (sp.brand.startsWith("#") ? sp.brand : `#${sp.brand}`) : null;
  return (
    <LocaleScope locale={locale} trade={trade} brandColor={brand}>
      <main id="main" className="min-h-dvh bg-background px-4 py-8 text-foreground md:px-8">
        <KitShowcase locale={locale} trade={trade} />
      </main>
    </LocaleScope>
  );
}
