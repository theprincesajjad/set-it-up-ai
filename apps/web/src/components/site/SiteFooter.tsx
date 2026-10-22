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
    <footer className="border-t border-line">
      <div className="mx-auto grid max-w-[1200px] grid-cols-2 gap-10 px-4 py-14 md:grid-cols-[1.6fr_repeat(4,1fr)] md:px-8">
        <div className="col-span-2 flex flex-col gap-3 md:col-span-1">
          <Wordmark />
          <p className="max-w-xs text-meta text-fg-muted">{BRAND.tagline}</p>
          <p className="text-meta text-fg-muted">
            {copy.misc.madeInToronto} ·{" "}
            <a className="text-fg underline decoration-line-strong/60 underline-offset-2 hover:decoration-fg" href={`mailto:${BRAND.supportEmail}`}>
              {BRAND.supportEmail}
            </a>
          </p>
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
        <p className="mx-auto max-w-[1200px] px-4 py-5 text-meta text-fg-subtle md:px-8">
          © {new Date().getFullYear()} {BRAND.name}. {copy.misc.freeForever}.
        </p>
      </div>
    </footer>
  );
}
