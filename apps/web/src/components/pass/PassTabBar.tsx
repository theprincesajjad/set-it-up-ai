"use client";
/**
 * Pass tab bar (Main Street Warm, Figma 32): four labelled tabs on a sand bar floating at the bottom of the pass column; the active tab is
 * a white pill with its glyph in the shop's trade colour. Card opens "my card", Rewards, Shops and Activity open those parts of the
 * wallet. Icons are Lucide; the rest are muted (never colour alone: the label weight changes too).
 */
import { Activity, Gift, Map, Wallet } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { useLocaleOrEnglish } from "@/lib/i18n/client";

export type PassTab = "card" | "rewards" | "shops" | "activity";

const itemCls = (on: boolean) =>
  cn(
    "flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 rounded-[18px] px-1 text-caption transition-colors duration-150 ease-out focus-visible:focus-ring",
    on ? "bg-card font-bold text-foreground shadow-card" : "font-medium text-muted-foreground hover:text-foreground",
  );

/**
 * `active` is the tab the page is showing (none on Settings or Discover). On the wallet page pass `onSelect` so the four tabs
 * switch in place; elsewhere they are plain links into the wallet (`/me#card`, `/me#rewards` ...).
 */
export function PassTabBar({ active, onSelect }: { active?: PassTab | null; onSelect?: (tab: PassTab) => void }) {
  const path = usePathname();
  const { t } = useLocaleOrEnglish();
  const link = (key: PassTab, label: string, Icon: LucideIcon, aria?: string) => (
    <Link
      key={key}
      href={`/me#${key}`}
      aria-label={aria}
      aria-current={active === key ? "page" : undefined}
      className={itemCls(active === key)}
      onClick={(e) => {
        if (onSelect && path === "/me") {
          e.preventDefault();
          onSelect(key);
        }
      }}
    >
      <Icon aria-hidden className={cn("size-6", active === key && "text-trade-deep")} strokeWidth={active === key ? 2 : 1.75} />
      <span aria-hidden={aria ? true : undefined}>{label}</span>
    </Link>
  );
  return (
    <nav aria-label={t("sh.nav.main")} className="fixed inset-x-0 bottom-0 z-40 mx-auto flex w-full max-w-[480px] items-stretch gap-1 rounded-t-[26px] border border-b-0 border-line bg-sidebar px-2.5 pt-2 pb-[max(10px,env(safe-area-inset-bottom))] shadow-card">
      {link("card", t("sh.card.tabCard"), Wallet, t("sh.nav.myCard"))}
      {link("rewards", t("sh.tab.rewards"), Gift)}
      {link("shops", t("sh.tab.shops"), Map)}
      {link("activity", t("sh.tab.activity"), Activity)}
    </nav>
  );
}
