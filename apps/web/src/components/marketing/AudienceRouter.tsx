import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { MapCategoryId } from "@ll/design-tokens";
import { CategoryIcon } from "@/components/ui/CategoryIcon";
import { copy } from "@/copy/en-CA";

/** One category object per door: shops, restaurants (eat), BIAs (all: the whole street), each on its own pastel tile. */
const DOORS: { art: MapCategoryId; tile: string; pill: string }[] = [
  { art: "shops", tile: "bg-tile-peach", pill: "text-tile-peach-foreground" },
  { art: "eat", tile: "bg-tile-butter", pill: "text-tile-butter-foreground" },
  { art: "all", tile: "bg-tile-lilac", pill: "text-tile-lilac-foreground" },
];

/** "Who are you?": three doors, one per buyer, so restaurants and BIAs reach their own page from the first scroll. */
export function AudienceRouter() {
  const r = copy.landing.router;
  return (
    <section aria-label={r.label} className="pb-12 md:pb-20">
      <div className="mx-auto max-w-[1200px] px-4 md:px-8">
        <ul className="grid gap-4 md:grid-cols-3">
          {r.items.map((i, n) => (
            <li key={i.href}>
              <Link href={i.href} className={`mkt-lift group flex h-full flex-col gap-3 rounded-tile p-6 focus-visible:focus-ring md:p-7 ${DOORS[n].tile} ${DOORS[n].pill}`}>
                <CategoryIcon category={DOORS[n].art} size={64} />
                <span className="text-meta-strong">{i.eyebrow}</span>
                <span className="display text-title text-balance md:text-[24px] md:leading-7">{i.title}</span>
                <span className="mt-auto inline-flex items-center gap-2 pt-2 text-meta-strong">
                  {i.cta}
                  <ArrowRight aria-hidden className="size-4 transition-transform duration-150 group-hover:translate-x-0.5 rtl:rotate-180" strokeWidth={2} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
