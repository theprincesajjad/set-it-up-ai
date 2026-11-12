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

const LINK = "inline-flex min-h-11 items-center rounded-md text-body text-mkt-on-black-muted underline decoration-transparent decoration-1 underline-offset-4 transition-colors hover:text-mkt-on-black hover:decoration-mkt-on-black focus-visible:focus-ring md:min-h-9";
/**
 * The A/B landing pages get a plain anchor, like every other link into them (PoweredBy, the solo nav): their beacon counts only a full
 * document load (ab-spec §4.1), and a <Link> prefetch runs the proxy's assignment, which wrote that page's `ll_v` over the one the
 * visitor already had (the footer is on every landing page). Next strips the prefetch headers before the proxy, so it cannot tell.
 */
const LANDING_AB = /^\/for-(nail-techs|barbers|groomers)(\?|$)/;

/**
 * Marketing footer (wave T, after squareup.com; wave V: the marketing text face, Halden since wave Y; links underline on hover): a black band. The wordmark, the one line it stands for and the one ask (a white pill),
 * then shop, neighbourhood, company and legal links in a dense grid, and a bottom bar under a hairline. "For shoppers" lives here, not
 * in the top nav. Links are 44px tall on phones, and every trade page and sign-in are one tap away. Its own `.mkt` scope (it also closes
 * the A/B landing pages, which have no marketing wrapper). Server-rendered, no script.
 */
/** The footer's language names: system fonts only, so no web font is fetched for them (see the note beside them). */
const SYSTEM_FACE = { fontFamily: "system-ui, sans-serif" } as const;

export function SiteFooter() {
  return (
    // The footer is English on every page, also on the pages shown in Hindi, Urdu or Punjabi: it says so (lang) and reads left to right
    // (on the Urdu page it otherwise inherited right-to-left, which moved the full stops and the © to the wrong end of each line).
    <footer lang="en-CA" dir="ltr" className={`mkt ${marketingFontVars} border-t border-mkt-rule-on-black bg-mkt-black font-mkt-sans text-mkt-on-black antialiased`}>
      <div className="mx-auto max-w-360 px-5 pt-14 md:px-10 md:pt-20 xl:px-15">
        <div className="flex flex-col gap-6 border-b border-mkt-rule-on-black pb-10 md:flex-row md:items-end md:justify-between md:pb-14">
          <div className="flex flex-col gap-3">
            <MarketingWordmark onBlack />
            <p className="max-w-md text-headline leading-relaxed text-mkt-on-black-muted">
              {BRAND.tagline} Loyalty is free forever; {PLANS.plus.name} has {TRIAL_DAYS} days free, no card.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <Link href="/signup" prefetch={false} className="inline-flex min-h-13 items-center rounded-full bg-mkt-paper px-7 text-headline font-semibold text-mkt-black transition-colors hover:bg-mkt-grey-hover focus-visible:focus-ring">
              Start free
            </Link>
            <a href={`mailto:${BRAND.supportEmail}`} className="inline-flex min-h-11 items-center text-base font-medium text-mkt-on-black underline decoration-1 underline-offset-4 focus-visible:focus-ring">
              {BRAND.supportEmail}
            </a>
          </div>
        </div>
        <nav aria-label="Footer" className="grid grid-cols-2 gap-x-6 gap-y-8 py-12 md:grid-cols-4 md:gap-10 md:py-14">
          {COLS.map((c) => (
            <div key={c.title}>
              <h2 className="font-mkt-sans text-body font-semibold text-mkt-on-black">{c.title}</h2>
              <ul className="mt-3 flex flex-col md:gap-1">
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
        {/* pb-24 on phones: the chat launcher sits fixed at the bottom corner and would cover the last line here. */}
        <div className="flex flex-col gap-1 border-t border-mkt-rule-on-black pt-6 pb-24 md:pb-6 text-sm text-mkt-on-black-muted md:flex-row md:items-center md:justify-between">
          <p>
            © {new Date().getFullYear()} {BRAND.name}, Toronto. Prices in CAD.
          </p>
          <p>
            Your customers see it in English,{" "}
            {/* The three names are set in the device's own fonts (every phone and desktop has these scripts): in the page's Noto stack
                these three words made every English visitor download three script fonts, about 385 KB, on every page with this footer. */}
            <span lang="hi" style={SYSTEM_FACE}>हिन्दी</span>,{" "}
            {/* No dir="rtl" here: the marketing pages promise no RTL region (e2e marketing language scope); bidi orders the word anyway. */}
            <span lang="ur" style={SYSTEM_FACE}>اردو</span>{" "}
            or <span lang="pa" style={SYSTEM_FACE}>ਪੰਜਾਬੀ</span>.
          </p>
        </div>
      </div>
    </footer>
  );
}
