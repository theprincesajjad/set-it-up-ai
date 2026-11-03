import Link from "next/link";
import { BRAND, PLANS, TRIAL_DAYS } from "@ll/shared";
import { MarketingWordmark } from "@/components/marketing/landing/Wordmark";
import { marketingFontVars } from "@/lib/marketing/fonts";

const COLS = [
  {
    title: "Shops",
    links: [
      { href: "/", label: "For shops" },
      { href: "/for-nail-techs", label: "For nail techs" },
      { href: "/for-barbers", label: "For barbers" },
      { href: "/for-groomers", label: "For groomers" },
      { href: "/for-restaurants", label: "For restaurants" },
      { href: "/pricing", label: "Pricing" },
      { href: "/#book", label: "Book a visit" },
    ],
  },
  { title: "Neighbourhoods", links: [{ href: "/for-bias", label: "For BIAs" }, { href: "/neighbourhoods", label: "Where we are" }, { href: "/for-shoppers", label: "For shoppers" }] },
  {
    title: "Company",
    links: [
      { href: `mailto:${BRAND.supportEmail}`, label: "Contact" },
      { href: "/login", label: "Sign in" },
      { href: "/accessibility", label: "Accessibility" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/legal/privacy", label: "Privacy" },
      { href: "/legal/terms", label: "Terms" },
      { href: "/legal/rewards", label: "Rewards terms" },
      { href: "/legal/merchants", label: "Merchant agreement" },
    ],
  },
];

const LINK = "inline-flex min-h-11 items-center text-body text-mkt-text2 transition-colors hover:text-mkt-ink focus-visible:focus-ring md:min-h-8";
/**
 * The A/B landing pages get a plain anchor, like every other link into them (PoweredBy, the solo nav): their beacon counts only a full
 * document load (ab-spec §4.1), and a <Link> prefetch runs the proxy's assignment, which wrote that page's `ll_v` over the one the
 * visitor already had (the footer is on every landing page). Next strips the prefetch headers before the proxy, so it cannot tell.
 */
const LANDING_AB = /^\/for-(nail-techs|barbers|groomers)(\?|$)/;

/**
 * Marketing footer (wave R): warm paper below a hairline, the wordmark with the one line it stands for and the one ask, then shop,
 * neighbourhood, company and legal links in quiet columns, and a bottom bar. No card, no pills. "For shoppers" lives here, not in the
 * top nav. Links are 44px tall on phones, and every trade page and sign-in are one tap away. Its own `.mkt` scope (it also closes the
 * A/B landing pages, which have no marketing wrapper). Server-rendered, no script.
 */
export function SiteFooter() {
  return (
    <footer className={`mkt ${marketingFontVars} border-t border-mkt-line bg-mkt-paper font-mkt-sans text-mkt-ink`}>
      <div className="mx-auto flex max-w-316 flex-col gap-6 px-4 pt-12 md:flex-row md:items-end md:justify-between md:px-8 md:pt-16">
        <div className="flex flex-col gap-2">
          <MarketingWordmark id="lp-ink-foot" />
          <p className="max-w-md text-body text-mkt-text2">
            {BRAND.tagline} Loyalty is free forever; {PLANS.plus.name} has {TRIAL_DAYS} days free, no card.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <Link href="/signup" prefetch={false} className="inline-flex min-h-12 items-center rounded-md bg-mkt-ink px-5 text-body font-medium text-mkt-on-ink transition-colors hover:bg-mkt-ink-hover focus-visible:focus-ring">
            Start free
          </Link>
          <a href={`mailto:${BRAND.supportEmail}`} className="inline-flex min-h-11 items-center text-body text-mkt-ink underline decoration-mkt-line-strong underline-offset-4 hover:decoration-mkt-ink focus-visible:focus-ring">
            {BRAND.supportEmail}
          </a>
        </div>
      </div>
      <nav aria-label="Footer" className="mx-auto grid max-w-316 grid-cols-2 gap-x-6 gap-y-8 px-4 py-12 md:grid-cols-4 md:gap-10 md:px-8">
        {COLS.map((c) => (
          <div key={c.title}>
            <h2 className="font-mkt-sans text-body font-medium tracking-normal text-mkt-ink">{c.title}</h2>
            <ul className="mt-2 flex flex-col md:mt-3 md:gap-1">
              {c.links.map((l) => (
                <li key={l.href + l.label}>
                  {LANDING_AB.test(l.href) ? (
                    <a href={l.href} className={LINK}>
                      {l.label}
                    </a>
                  ) : (
                    <Link href={l.href} className={LINK}>
                      {l.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <div className="border-t border-mkt-line">
        <div className="mx-auto flex max-w-316 flex-col gap-1 px-4 py-5 text-meta text-mkt-muted md:flex-row md:items-center md:justify-between md:px-8">
          <p>
            © {new Date().getFullYear()} {BRAND.name}, Toronto. Prices in CAD.
          </p>
          <p>
            Your customers see it in English,{" "}
            <span lang="hi">हिन्दी</span>,{" "}
            {/* No dir="rtl" here: the marketing pages promise no RTL region (e2e marketing language scope); bidi orders the word anyway. */}
            <span lang="ur">اردو</span>{" "}
            or <span lang="pa">ਪੰਜਾਬੀ</span>.
          </p>
        </div>
      </div>
    </footer>
  );
}
