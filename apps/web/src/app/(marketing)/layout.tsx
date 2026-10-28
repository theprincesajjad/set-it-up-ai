import { Awning } from "@/components/marketing/Awning";
import { SalesChat } from "@/components/marketing/SalesChat";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader, type HeaderLabelsByLocale } from "@/components/site/SiteHeader";
import { t, type Locale } from "@ll/shared";

/** Header strings per language, translated here on the server so the message catalogs stay out of the client bundle. */
function headerLabels(): HeaderLabelsByLocale {
  const one = (l: Locale) => ({
    nav: { "/": t(l, "mkt.nav.shops"), "/for-restaurants": t(l, "mkt.nav.restaurants"), "/for-bias": t(l, "mkt.nav.bias"), "/pricing": t(l, "mkt.nav.pricing") },
    login: t(l, "mkt.nav.login"),
    getStarted: t(l, "mkt.nav.getStarted"),
    language: t(l, "mkt.nav.language"),
  });
  return { en: one("en"), hi: one("hi"), ur: one("ur"), pa: one("pa") };
}

/** Paper canvas for the whole marketing site, with the one awning stripe above the header. */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-paper">
      <Awning />
      <SiteHeader labels={headerLabels()} />
      <main id="main">{children}</main>
      <SiteFooter />
      <SalesChat />
    </div>
  );
}
