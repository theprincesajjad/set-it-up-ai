"use client";
import Link from "next/link";
import type { commerceApi } from "@ll/shared";
import { Heading, useFmt } from "./ui";

/** "most ordered": a row of the dishes guests actually order, from the last 30 days. Photo slots stay grey until the shop adds photos. */
export function PopularRow({ slug, items }: { slug: string; items: commerceApi.CatalogItemDto[] }) {
  const { t, money, pick } = useFmt();
  if (!items.length) return null;
  return (
    <section aria-labelledby="rs-popular" className="flex flex-col gap-3">
      <Heading level={2}>
        <span id="rs-popular">{t("rs.popular.title")}</span>
      </Heading>
      <ul className="no-scrollbar -mx-4 flex scroll-px-4 snap-x gap-3 overflow-x-auto px-4 pb-1">
        {items.map((i) => {
          const p = pick(i);
          return (
            <li key={i.id} className="w-40 shrink-0 snap-start">
              <Link href={`/shops/${encodeURIComponent(slug)}/menu#item-${i.id}`} className="flex flex-col gap-2 rounded-card focus-visible:focus-ring">
                {i.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={i.imageUrl} alt="" width={160} height={120} loading="lazy" decoding="async" className="aspect-[4/3] w-full rounded-card bg-bg-subtle object-cover" />
                ) : null}
                <span className="line-clamp-2 min-h-10 break-words text-body-strong text-fg">{p.name}</span>
                <span className="-mt-1 text-meta tabular-nums text-fg-muted">{money(i.priceCents)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
