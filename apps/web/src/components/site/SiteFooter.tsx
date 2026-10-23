import Link from "next/link";
import { BRAND } from "@ll/shared";
import { Wordmark } from "./Brand";

const COLS = [
  { title: "Shops", links: [{ href: "/", label: "For shops" }, { href: "/for-restaurants", label: "For restaurants" }, { href: "/pricing", label: "Pricing" }, { href: "/#book", label: "Book a visit" }] },
  { title: "Neighbourhoods", links: [{ href: "/for-bias", label: "For BIAs" }, { href: "/neighbourhoods", label: "Where we are" }, { href: "/for-shoppers", label: "For shoppers" }] },
  {
    title: "Company",
    links: [
      { href: `mailto:${BRAND.supportEmail}`, label: "Contact" },
      { href: "/legal/privacy", label: "Privacy" },
      { href: "/legal/terms", label: "Terms" },
      { href: "/legal/rewards", label: "Rewards terms" },
      { href: "/accessibility", label: "Accessibility" },
    ],
  },
];

/** Marketing footer: shop, neighbourhood and company links on the quiet grey band. "For shoppers" lives here, not in the top nav. */
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
            <ul className="mt-3 flex flex-col gap-2.5">
              {c.links.map((l) => (
                <li key={l.href + l.label}>
                  <Link href={l.href} className="text-meta text-fg-muted transition-colors hover:text-fg focus-visible:focus-ring">
                    {l.label}
                  </Link>
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
