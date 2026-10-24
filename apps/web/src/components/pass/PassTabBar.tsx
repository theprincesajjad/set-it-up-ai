"use client";
/**
 * Web pass tab bar (canvas Main / Discover / Wallet artboards): a frosted capsule with map · discover ·
 * wallet · avatar (activity), and the separate round black 60 px "my card" button to its right
 * (Corner's "+" button). Fixed 26 px above the bottom edge, inside the 480 px pass column.
 */
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { useLocaleOrEnglish } from "@/lib/i18n/client";

export const OPEN_CARD_EVENT = "ll:open-card";

function MapGlyph({ on }: { on: boolean }) {
  return (
    <svg aria-hidden width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={on ? 2 : 1.8} strokeLinejoin="round">
      <path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2z" />
      <path d="M9 4v14M15 6v14" />
    </svg>
  );
}
function DiscoverGlyph({ on }: { on: boolean }) {
  return (
    <svg aria-hidden width="24" height="24" viewBox="0 0 24 24" fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round">
      <path d="M12 3l2.6 5.6L20 9.3l-4 4 1 5.7-5-2.8-5 2.8 1-5.7-4-4 5.4-.7z" />
    </svg>
  );
}
function WalletGlyph({ on }: { on: boolean }) {
  return (
    <svg aria-hidden width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={on ? 2 : 1.8} strokeLinejoin="round">
      <rect x="3" y="6" width="18" height="14" rx="3" />
      <path d="M3 10h18M16 15h2" />
    </svg>
  );
}
export function CardGlyph({ size = 24 }: { size?: number }) {
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <path d="M14 14h3v3M21 14v.01M14 21h.01M17.5 21H21v-3.5" />
    </svg>
  );
}

export function PassTabBar({ initials, active }: { initials: string; active?: "map" | "discover" | "wallet" | "activity" }) {
  const path = usePathname();
  const router = useRouter();
  const { t } = useLocaleOrEnglish();
  const current = active ?? (path.startsWith("/discover") ? "discover" : path.startsWith("/map") ? "map" : "wallet");
  const item = (key: typeof current, href: string, label: string, glyph: React.ReactNode) => (
    <Link
      href={href}
      aria-label={label}
      aria-current={current === key ? "page" : undefined}
      className={cn("flex h-11 w-12 items-center justify-center rounded-full focus-visible:focus-ring", current === key ? "text-fg" : "text-fg-subtle hover:text-fg-muted")}
    >
      {glyph}
    </Link>
  );
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[26px] z-40 mx-auto flex w-full max-w-[480px] items-center gap-2.5 px-4">
      <nav
        aria-label={t("sh.nav.main")}
        className="pointer-events-auto flex h-[60px] flex-1 items-center justify-around rounded-full bg-[rgba(255,255,255,.86)] px-2 shadow-float backdrop-blur-[20px] dark:bg-[rgba(22,22,24,.86)]"
      >
        {item("map", "/map", t("sh.nav.map"), <MapGlyph on={current === "map"} />)}
        {item("discover", "/discover", t("sh.nav.discover"), <DiscoverGlyph on={current === "discover"} />)}
        {item("wallet", "/me", t("sh.nav.wallet"), <WalletGlyph on={current === "wallet"} />)}
        <Link href="/me#activity" aria-label={t("sh.nav.activity")} className="flex h-11 w-12 items-center justify-center rounded-full focus-visible:focus-ring">
          <span className="flex size-7 items-center justify-center rounded-full bg-bg-muted text-[11px] font-semibold text-fg">{initials}</span>
        </Link>
      </nav>
      <button
        type="button"
        aria-label={t("sh.nav.myCard")}
        onClick={() => {
          if (path === "/me") window.dispatchEvent(new Event(OPEN_CARD_EVENT));
          else router.push("/me#card");
        }}
        className="pointer-events-auto flex size-[60px] shrink-0 items-center justify-center rounded-full bg-fg text-bg shadow-[0_4px_16px_rgba(0,0,0,.24)] focus-visible:focus-ring"
      >
        <CardGlyph />
      </button>
    </div>
  );
}
