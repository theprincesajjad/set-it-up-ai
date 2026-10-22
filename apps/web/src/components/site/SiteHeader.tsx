import { Menu } from "lucide-react";
import Link from "next/link";
import { buttonClasses } from "@/components/ui/Button";
import { Wordmark } from "./Brand";

const NAV = [
  { href: "/", label: "For shops" },
  { href: "/for-shoppers", label: "For shoppers" },
  { href: "/for-bias", label: "For BIAs" },
  { href: "/neighbourhoods", label: "Neighbourhoods" },
  { href: "/pricing", label: "Pricing" },
];

/** Marketing top nav: white, hairline, one black button. Mobile menu uses <details> (no JS). */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-sticky border-b border-line bg-bg/90 backdrop-blur-chrome">
      <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-4 px-4 md:px-8">
        <Wordmark />
        <nav aria-label="Main" className="hidden items-center gap-0.5 lg:flex">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="rounded-full px-3.5 py-2 text-meta-strong text-fg-muted transition-colors hover:bg-bg-subtle hover:text-fg focus-visible:focus-ring">
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="hidden items-center gap-1 lg:flex">
          <Link href="/login" className="rounded-full px-3.5 py-2 text-meta-strong text-fg hover:bg-bg-subtle focus-visible:focus-ring">
            Sign in
          </Link>
          <Link href="/signup" className={buttonClasses({ size: "sm" }) + " rounded-full!"}>
            Get started free
          </Link>
        </div>
        <details className="group relative lg:hidden">
          <summary className="flex size-11 cursor-pointer list-none items-center justify-center rounded-full hover:bg-bg-subtle focus-visible:focus-ring [&::-webkit-details-marker]:hidden" aria-label="Menu">
            <Menu aria-hidden className="size-5" strokeWidth={1.75} />
          </summary>
          <div className="absolute end-0 top-14 w-[min(88vw,320px)] rounded-card border border-line bg-bg p-2 shadow-float">
            <nav aria-label="Main" className="flex flex-col">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className="rounded-input px-3 py-3 text-body text-fg hover:bg-bg-subtle">
                  {n.label}
                </Link>
              ))}
              <Link href="/login" className="rounded-input px-3 py-3 text-body text-fg hover:bg-bg-subtle">
                Sign in
              </Link>
              <Link href="/signup" className={buttonClasses({ fullWidth: true, size: "lg" }) + " mt-2"}>
                Get started free
              </Link>
            </nav>
          </div>
        </details>
      </div>
    </header>
  );
}
