import "./marketing.css";
import { preload } from "react-dom";
import { Awning } from "@/components/marketing/Awning";
import { SalesChat } from "@/components/marketing/SalesChat";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader, type HeaderLabelsByLocale } from "@/components/site/SiteHeader";
import { t, type Locale } from "@ll/shared";
import { marketingSkipLinkCss } from "@/lib/marketing/fonts";
import { SERIF_FILES } from "@/lib/marketing/serif";

/** Header strings per language, translated here on the server so the message catalogs stay out of the client bundle. */
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
 * Paper canvas for the whole marketing site, with the one awning stripe above the header. Inter is not preloaded here: the home page
 * draws nothing in it, so each other marketing page calls preloadInter() itself (lib/fonts/inter.ts). Strata, the headline face of every
 * marketing page (marketing.css `.mkt-pages`), is preloaded here so no headline waits on it (the home page preloads it too; React dedupes).
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  preload(SERIF_FILES[0], { as: "font", type: "font/woff2", crossOrigin: "anonymous", fetchPriority: "high" });
  return (
    <div className="bg-paper">
      <style href="ll-skip-mkt" precedence="default">
        {marketingSkipLinkCss}
      </style>
      <Awning />
      <SiteHeader labels={headerLabels()} />
      <main id="main" className="mkt-pages">{children}</main>
      <SiteFooter />
      <SalesChat />
    </div>
  );
}
