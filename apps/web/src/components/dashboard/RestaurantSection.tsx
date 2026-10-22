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
      {children}
    </div>
  );
}
