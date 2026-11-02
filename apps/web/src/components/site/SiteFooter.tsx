import { ArrowRight, Mail } from "lucide-react";
import Link from "next/link";
import { BRAND, PLANS, TRIAL_DAYS } from "@ll/shared";
import { Wordmark } from "./Brand";

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

const LINK = "inline-flex min-h-11 items-center text-meta text-fg-muted transition-colors hover:text-fg focus-visible:focus-ring md:min-h-0";
/**
 * The A/B landing pages get a plain anchor, like every other link into them (PoweredBy, the solo nav): their beacon counts only a full
 * document load (ab-spec §4.1), and a <Link> prefetch runs the proxy's assignment, which wrote that page's `ll_v` over the one the
 * visitor already had (the footer is on every landing page). Next strips the prefetch headers before the proxy, so it cannot tell.
 */
const LANDING_AB = /^\/for-(nail-techs|barbers|groomers)(\?|$)/;

/**
 * Marketing footer (wave Q): a closing card with the one ask and the price in a line, then shop, neighbourhood, company and legal links
 * on the quiet grey band, and a bottom bar. "For shoppers" lives here, not in the top nav. Links are 44px tall on phones (wave P), and
 * every trade page and sign-in are one tap away. Server-rendered, no script.
 */
export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-bg-subtle">
      <div className="mx-auto max-w-[1200px] px-4 pt-10 md:px-8 md:pt-14">
        <div className="card-clear flex flex-col gap-5 p-6 md:flex-row md:items-center md:justify-between md:gap-10 md:p-8">
          <div className="flex flex-col gap-3">
            <Wordmark />
            <p className="max-w-md text-body text-fg-muted">
              {BRAND.tagline} Loyalty is free forever; {PLANS.plus.name} has {TRIAL_DAYS} days free, no card.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/signup" prefetch={false} className="inline-flex min-h-12 items-center gap-2 rounded-full bg-primary px-6 text-body-strong text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:focus-ring">
              Start free
              <ArrowRight aria-hidden className="size-4 rtl:-scale-x-100" strokeWidth={2.4} />
            </Link>
            <a href={`mailto:${BRAND.supportEmail}`} className="inline-flex min-h-12 items-center gap-2 rounded-full bg-card px-5 text-body-strong text-fg shadow-[inset_0_0_0_1px_var(--border-strong)] transition-colors hover:bg-muted focus-visible:focus-ring">
              <Mail aria-hidden className="size-4" strokeWidth={2} />
              {BRAND.supportEmail}
            </a>
          </div>
        </div>
      </div>
      <nav aria-label="Footer" className="mx-auto grid max-w-[1200px] grid-cols-2 gap-x-6 gap-y-8 px-4 py-10 md:grid-cols-4 md:gap-10 md:px-8 md:py-12">
        {COLS.map((c) => (
          <div key={c.title}>
            <h2 className="text-meta-strong text-fg">{c.title}</h2>
            <ul className="mt-2 flex flex-col md:mt-3 md:gap-2.5">
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
      <div className="border-t border-line">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-1 px-4 py-5 text-meta text-fg-muted md:flex-row md:items-center md:justify-between md:px-8">
          <p>
            © {new Date().getFullYear()} {BRAND.name}, Toronto. Prices in CAD.
          </p>
          <p>
            Your customers see it in English,{" "}
            <span lang="hi">हिन्दी</span>,{" "}
            <span lang="ur" dir="rtl">
              اردو
            </span>{" "}
            or <span lang="pa">ਪੰਜਾਬੀ</span>.
          </p>
        </div>
      </div>
    </footer>
  );
}
