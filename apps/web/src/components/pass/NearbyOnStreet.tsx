"use client";
/**
 * "Nearby on your street" (Figma 32): up to three shops on the member's street they have not joined, each a coloured icon tile, the shop,
 * one line about it and a pill at the end (a live promo, a standing perk, or "New"). Lucide in tiles, never emoji.
 */
import Link from "next/link";
import { placeKindLabel, type networkApi } from "@ll/shared";
import { verticalCategory, type VerticalCategory } from "@ll/design-tokens";
import { ActionPill } from "@/components/ui/ActionPill";
import { IconTile } from "@/components/ui/IconTile";
import type { Tone } from "@/components/ui/tones";
import { verticalIcon } from "@/components/ui/VerticalIcon";
import { useLocaleOrEnglish } from "@/lib/i18n/client";
import { PassPanel } from "./PassChrome";
import { usePassStyle } from "./useThemeStyle";

const CATEGORY_TONE: Partial<Record<VerticalCategory, Tone>> = { coffee: "peach", bakery: "butter", eat: "peach", shops: "lilac", beauty: "rose", services: "sky", repair: "mint" };

export function NearbyOnStreet({ shops }: { shops: networkApi.ShopListItemDto[] }) {
  const { t, locale } = useLocaleOrEnglish();
  const clear = usePassStyle() === "clear";
  if (!shops.length) return null;
  return (
    <PassPanel title={t("pass.nearby.title")} id="nearby">
      {shops.map((s) => {
        const m = s.merchant;
        const kind = placeKindLabel(locale, m.vertical);
        const line = s.promoLine ?? s.perk;
        const pill = s.hasPromo || s.promoLine ? t("pass.nearby.deal") : s.perk ? t("pass.nearby.perk") : t("pass.nearby.new");
        if (clear) {
          const Icon = verticalIcon(m.vertical);
          // Clear row (audit 2.4 "Row"): 64 tall, padding 12 16, a 36 r12 tile in the shop's trade tint, 12 to the text, a 20px badge.
          return (
            <li key={m.id} data-trade={m.vertical}>
              <Link href={`/shops/${m.slug}`} className="-mx-4 flex min-h-16 items-center gap-3 px-4 py-3 transition-colors hover:bg-hover focus-visible:focus-ring">
                <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-r4 bg-trade-tint text-trade">
                  <Icon className="size-[18px]" strokeWidth={1.8} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body font-semibold text-foreground"><bdi>{m.name}</bdi></span>
                  <span className="block truncate text-body text-muted-foreground">{line ? `${kind} · ${line}` : kind}</span>
                </span>
                <span className="inline-flex h-5 shrink-0 items-center rounded-r2 bg-muted px-2 text-[12px] font-medium leading-4 text-foreground">{pill}</span>
              </Link>
            </li>
          );
        }
        return (
          <li key={m.id}>
            <Link href={`/shops/${m.slug}`} className="-mx-4 flex min-h-[68px] items-center gap-3.5 px-4 py-3 transition-colors hover:bg-hover focus-visible:focus-ring">
              <IconTile icon={verticalIcon(m.vertical)} tone={CATEGORY_TONE[verticalCategory(m.vertical)] ?? "peach"} size="lg" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-body-strong text-foreground"><bdi>{m.name}</bdi></span>
                <span className="block truncate text-meta text-muted-foreground">{line ? `${kind} · ${line}` : kind}</span>
              </span>
              <ActionPill decorative>{pill}</ActionPill>
            </Link>
          </li>
        );
      })}
    </PassPanel>
  );
}
