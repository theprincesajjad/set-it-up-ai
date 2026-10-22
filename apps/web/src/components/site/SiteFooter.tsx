import Link from "next/link";
import { BRAND } from "@ll/shared";
import { copy } from "@/copy/en-CA";
import { Wordmark } from "./Brand";

const COLS = [
  { title: "Shops", links: [{ href: "/", label: "How it works" }, { href: "/pricing", label: "Pricing" }, { href: "/signup", label: "Get started free" }, { href: "/login", label: "Sign in" }] },
  { title: "Shoppers", links: [{ href: "/for-shoppers", label: "How it works" }, { href: "/neighbourhoods", label: "Neighbourhoods" }, { href: "/map", label: "Shops near me" }, { href: "/me", label: "My card" }] },
  { title: "Neighbourhoods", links: [{ href: "/for-bias", label: "For BIAs" }, { href: "/neighbourhoods", label: "Where we are" }] },
  { title: "Legal", links: [{ href: "/legal/terms", label: "Terms" }, { href: "/legal/privacy", label: "Privacy" }, { href: "/legal/rewards", label: "Rewards terms" }, { href: "/accessibility", label: "Accessibility" }] },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-canvas-subtle">
      <div className="mx-auto grid max-w-[1200px] gap-10 px-4 py-12 md:grid-cols-[1.4fr_repeat(4,1fr)] md:px-8">
        <div className="flex flex-col gap-3">
          <Wordmark />
          <p className="text-body-sm text-fg-muted">{BRAND.tagline}</p>
          <p className="text-body-sm text-fg-muted">
            {copy.misc.madeInToronto} ·{" "}
            <a className="text-fg-link underline" href={`mailto:${BRAND.supportEmail}`}>
              {BRAND.supportEmail}
            </a>
          </p>
        </div>
        {COLS.map((c) => (
          <div key={c.title}>
            <h2 className="text-overline uppercase text-fg-muted">{c.title}</h2>
            <ul className="mt-3 flex flex-col gap-2">
              {c.links.map((l) => (
                <li key={l.href + l.label}>
                  <Link href={l.href} className="text-body-sm text-fg hover:text-fg-link hover:underline focus-visible:focus-ring">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-border">
        <p className="mx-auto max-w-[1200px] px-4 py-4 text-caption text-fg-muted md:px-8">
          © {new Date().getFullYear()} {BRAND.name}. {copy.misc.freeForever}.
        </p>
      </div>
    </footer>
  );
}
