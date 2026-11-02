import Link from "next/link";
import { BRAND } from "@ll/shared";
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
      { href: "/legal/privacy", label: "Privacy" },
      { href: "/legal/terms", label: "Terms" },
      { href: "/legal/rewards", label: "Rewards terms" },
      { href: "/legal/merchants", label: "Merchant agreement" },
      { href: "/accessibility", label: "Accessibility" },
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

/** Marketing footer: shop, neighbourhood and company links on the quiet grey band. "For shoppers" lives here, not in the top nav. Links are 44px tall on phones (wave P), and every trade page and sign-in are one tap away. */
export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-bg-subtle">
      <div className="mx-auto grid max-w-[1200px] grid-cols-2 gap-10 px-4 py-14 md:grid-cols-[1.6fr_repeat(3,1fr)] md:px-8">
        <div className="col-span-2 flex flex-col gap-3 md:col-span-1">
          <Wordmark />
          <p className="max-w-xs text-meta text-fg-muted">{BRAND.tagline}</p>
        </div>
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
      </div>
      <div className="border-t border-line">
        <p className="mx-auto max-w-[1200px] px-4 py-5 text-meta text-fg-muted md:px-8">
          © {new Date().getFullYear()} {BRAND.name}, Toronto. Prices in CAD.
        </p>
      </div>
    </footer>
  );
}
