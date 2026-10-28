"use client";
/**
 * Pass tab bar (v3 frame 15:184): four labelled tabs on a flat bar with a hairline top edge, fixed to the bottom of the pass column.
 * Card opens "my card" (the QR sheet), Rewards, Shops and Activity open those parts of the wallet. Icons are Lucide at 1.75
 * stroke; the active tab is black with a heavier label, the rest are muted (never colour alone: the label weight changes too).
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
    "flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg px-1 text-caption transition-colors duration-150 ease-out focus-visible:focus-ring",
    on ? "font-semibold text-foreground" : "font-medium text-muted-foreground hover:text-foreground",
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
      <Icon aria-hidden className="size-6" strokeWidth={active === key ? 2 : 1.75} />
      <span aria-hidden={aria ? true : undefined}>{label}</span>
    </Link>
  );
  return (
    <nav aria-label={t("sh.nav.main")} className="fixed inset-x-0 bottom-0 z-40 mx-auto flex w-full max-w-[480px] items-stretch gap-1 border-t border-border bg-card px-2 pt-1.5 pb-[max(6px,env(safe-area-inset-bottom))]">
      {link("card", t("sh.card.tabCard"), Wallet, t("sh.nav.myCard"))}
      {link("rewards", t("sh.tab.rewards"), Gift)}
      {link("shops", t("sh.tab.shops"), Map)}
      {link("activity", t("sh.tab.activity"), Activity)}
    </nav>
  );
}
