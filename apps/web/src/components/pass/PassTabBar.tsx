"use client";
/**
 * Pass tab bar (v3 frame 15:184): four labelled tabs on a flat bar with a hairline top edge, fixed to the bottom of the pass column.
 * Card opens "my card" (the QR sheet), Rewards, Shops and Activity open those parts of the wallet. Icons are Lucide at 1.75
 * stroke; the active tab is black with a heavier label, the rest are muted (never colour alone: the label weight changes too).
 */
import { Activity, Gift, Map as MapIcon, Wallet } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { useLocaleOrEnglish } from "@/lib/i18n/client";

export const OPEN_CARD_EVENT = "ll:open-card";

export type PassTab = "card" | "rewards" | "shops" | "activity";

export function CardGlyph({ size = 24 }: { size?: number }) {
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <path d="M14 14h3v3M21 14v.01M14 21h.01M17.5 21H21v-3.5" />
    </svg>
  );
}

const itemCls = (on: boolean) =>
  cn(
    "flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg px-1 text-caption transition-colors duration-150 ease-out focus-visible:focus-ring",
    on ? "font-semibold text-foreground" : "font-medium text-muted-foreground hover:text-foreground",
  );

/**
 * `active` is the tab the page is showing (none while the card sheet or Settings is). On the wallet page pass `onSelect` so the
 * Rewards, Shops and Activity tabs switch in place; elsewhere they are plain links into the wallet.
 */
export function PassTabBar({ active, onSelect }: { active?: Exclude<PassTab, "card"> | null; onSelect?: (tab: Exclude<PassTab, "card">) => void }) {
  const path = usePathname();
  const router = useRouter();
  const { t } = useLocaleOrEnglish();
  const link = (key: Exclude<PassTab, "card">, label: string, Icon: LucideIcon, href: string) => (
    <Link
      key={key}
      href={href}
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
      <span>{label}</span>
    </Link>
  );
  return (
    <nav aria-label={t("sh.nav.main")} className="fixed inset-x-0 bottom-0 z-40 mx-auto flex w-full max-w-[480px] items-stretch gap-1 border-t border-border bg-card px-2 pt-1.5 pb-[max(6px,env(safe-area-inset-bottom))]">
      <button
        type="button"
        aria-label={t("sh.nav.myCard")}
        onClick={() => {
          if (path === "/me") window.dispatchEvent(new Event(OPEN_CARD_EVENT));
          else router.push("/me#card");
        }}
        className={itemCls(false)}
      >
        <Wallet aria-hidden className="size-6" strokeWidth={1.75} />
        <span aria-hidden>{t("sh.card.tabCard")}</span>
      </button>
      {link("rewards", t("sh.tab.rewards"), Gift, "/me#rewards")}
      {link("shops", t("sh.tab.shops"), MapIcon, "/me#shops")}
      {link("activity", t("sh.tab.activity"), Activity, "/me#activity")}
    </nav>
  );
}
