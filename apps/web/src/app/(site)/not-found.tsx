import "@/app/(marketing)/marketing.css";
import { t, type Locale } from "@ll/shared";
import { Awning } from "@/components/marketing/Awning";
import { NotFoundCard } from "@/components/errors/NotFoundCard";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader, type HeaderLabelsByLocale } from "@/components/site/SiteHeader";
import { marketingSkipLinkCss } from "@/lib/marketing/fonts";

/** Same header strings as the marketing layout (translated on the server so the client never loads the catalogues). */
function headerLabels(): HeaderLabelsByLocale {
  const one = (l: Locale) => ({
    nav: { "/": t(l, "mkt.nav.shops"), "/for-restaurants": t(l, "mkt.nav.restaurants"), "/for-bias": t(l, "mkt.nav.bias"), "/pricing": t(l, "mkt.nav.pricing") },
    login: t(l, "mkt.nav.login"),
    getStarted: t(l, "mkt.nav.getStarted"),
    language: t(l, "mkt.nav.language"),
    findShops: t(l, "sh.fs.ctaFind"),
    myCard: t(l, "sh.fs.ctaCard"),
  });
  return { en: one("en"), hi: one("hi"), ur: one("ur"), pa: one("pa") };
}

/**
 * A one-segment URL nobody owns (/contact, /about, /faq, a mistyped link). Next routes it to app/(site)/[domain] before it can reach the
 * marketing catch-all, so this 404 draws the marketing header and footer itself: a visitor keeps the navigation, not a bare card.
 */
export default function SiteNotFound() {
  return (
    <div className="bg-paper">
      <style href="ll-skip-mkt" precedence="default">
        {marketingSkipLinkCss}
      </style>
      <Awning />
      <SiteHeader labels={headerLabels()} />
      <main id="main" className="mkt-pages mx-auto max-w-130 px-4 py-12 md:py-20">
        <NotFoundCard />
      </main>
      <SiteFooter />
    </div>
  );
}
