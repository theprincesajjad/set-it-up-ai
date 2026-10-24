"use client";
/**
 * Shared frame for the restaurant pack pages (`/m/[id]/restaurant/<slug>`): gates on any
 * `restaurant.*` feature and shows the section's pages as a scrollable tab strip under the top bar
 * (the sidebar carries the same entries, locked modules folded into "More for restaurants"; the strip is what phone users reach for).
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { RESTAURANT_MORE, hasRestaurantFeature, enabledSet, restaurantModules } from "@/lib/dashboard/nav";
import { TierTeaser } from "./restaurant/shared";
import { TaxNotSetBanner } from "./TaxStatus";
import { useMerchant } from "./MerchantContext";

export function RestaurantSection({ children }: { children: ReactNode }) {
  const { base, features } = useMerchant();
  const pathname = usePathname() ?? "";
  const enabled = enabledSet(features.features);
  if (!hasRestaurantFeature(enabled)) return <TierTeaser featureKey="restaurant.dietary_tags" title="Restaurant tools" description="Halal and dietary tags, tiffin subscriptions, catering, pot pre-orders and WhatsApp ordering, built for restaurants." />;
  const { unlocked, locked } = restaurantModules(enabled);
  const tabs = [...unlocked, ...(locked.length ? [RESTAURANT_MORE] : [])];
  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Restaurant" className="-mx-4 overflow-x-auto border-b border-line px-4 [scrollbar-width:none] md:mx-0 md:px-0 lg:hidden">
        <ul className="flex gap-5">
          {tabs.map((r) => {
            const href = `${base}/restaurant/${r.slug}`;
            const on = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <li key={r.slug} className="shrink-0">
                <Link href={href} aria-current={on ? "page" : undefined} className={cn("-mb-px inline-flex h-10 items-center border-b-2 text-meta transition-colors focus-visible:focus-ring", on ? "border-fg font-medium text-fg" : "border-transparent text-fg-muted hover:text-fg")}>
                  {r.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      {/* The sidebar has one "Catering & banquet" entry; on those two pages a small switch moves between them. */}
      {(pathname.startsWith(`${base}/restaurant/catering`) || pathname.startsWith(`${base}/restaurant/banquet`)) && unlocked.some((r) => r.slug === "catering") && unlocked.some((r) => r.slug === "banquet") ? (
        <div role="group" aria-label="Catering and banquet" className="hidden gap-1.5 lg:flex">
          {(["catering", "banquet"] as const).map((slug) => {
            const on = pathname.startsWith(`${base}/restaurant/${slug}`);
            return (
              <Link key={slug} href={`${base}/restaurant/${slug}`} aria-current={on ? "page" : undefined} className={cn("inline-flex h-8 items-center rounded-full border px-3.5 text-meta-strong focus-visible:focus-ring", on ? "border-fg bg-fg text-bg" : "border-line text-fg hover:bg-bg-subtle")}>
                {slug === "catering" ? "Catering" : "Banquet halls"}
              </Link>
            );
          })}
        </div>
      ) : null}
      <TaxNotSetBanner />
      {children}
    </div>
  );
}
