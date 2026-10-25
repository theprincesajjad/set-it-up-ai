"use client";
/**
 * "Add to Apple Wallet" / "Add to Google Wallet" buttons (owned by the wallet team).
 *
 * Brand rules followed (Apple Wallet "Add to Apple Wallet" badge guidelines; Google Wallet
 * brand guidelines for the "Add to Google Wallet" button):
 *  - Official wording only, never shortened or translated ad hoc: "Add to Apple Wallet",
 *    "Add to Google Wallet" (walletApi.WALLET_BUTTON_TEXT).
 *  - Always the black version (on light and dark pages); Apple keeps its thin grey outline.
 *  - Never recoloured, never in our accent, never with our own icon inside; min height 44/48 px;
 *    clear space around the badge ≥ 1/4 of its height (the `gap` in <WalletButtons>).
 *  - Show only the platform's own button when we know it (iPhone → Apple, Android → Google).
 *
 * BEFORE LAUNCH: drop the official artwork into apps/web/public/wallet-badges/
 *   add-to-apple-wallet.svg   (Apple: developer.apple.com/wallet/add-to-apple-wallet-guidelines, en-CA/fr-CA)
 *   add-to-google-wallet.svg  (Google: developers.google.com/wallet/generic/resources/brand-guidelines)
 * and set NEXT_PUBLIC_WALLET_BADGES=1. Until then these render the official wording in a black
 * capsule with a neutral wallet glyph (we must not imitate either company's logo).
 */
"use client";
import type { ButtonHTMLAttributes } from "react";
import { walletApi } from "@ll/shared";
import { cn } from "@/lib/cn";
import { useLocaleOrEnglish } from "@/lib/i18n/client";
import { Spinner } from "@/components/ui/Spinner";

const OFFICIAL = process.env.NEXT_PUBLIC_WALLET_BADGES === "1";
export const OFFICIAL_BADGE_SRC = { apple: "/wallet-badges/add-to-apple-wallet.svg", google: "/wallet-badges/add-to-google-wallet.svg" } as const;

type Platform = "apple" | "google";

export interface WalletBadgeProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  loading?: boolean;
  /** Render as a link instead (e.g. a signed .pkpass URL or the Google save URL). */
  href?: string;
  fullWidth?: boolean;
  /** Force the placeholder even when official artwork is enabled (tests, storybook). */
  placeholder?: boolean;
}

/** Neutral wallet glyph (not either company's logo). */
function WalletGlyph() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 7V5.5A1.5 1.5 0 0 0 17.5 4h-12A2.5 2.5 0 0 0 3 6.5v11A2.5 2.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V16" />
      <path d="M3 6.5A2.5 2.5 0 0 0 5.5 9h13A1.5 1.5 0 0 1 20 10.5V16h-4a2.5 2.5 0 0 1 0-5h4" />
    </svg>
  );
}

function Badge({ platform, loading, href, fullWidth, placeholder, className, disabled, ...rest }: WalletBadgeProps & { platform: Platform }) {
  const { t, locale } = useLocaleOrEnglish();
  // English keeps the official wording; hi / ur / pa say "Add to ..." in one line (the two-line lockup is English only).
  const label = locale === "en" ? walletApi.WALLET_BUTTON_TEXT[platform] : t(platform === "apple" ? "ms.wallet.addApple" : "ms.wallet.addGoogle");
  const official = OFFICIAL && !placeholder;
  const shape =
    platform === "apple"
      ? // Apple badge: black, rounded rectangle, thin grey outline, two-line lockup.
        "rounded-[10px] border border-[#A6A6A6] h-12 px-4"
      : // Google button: black pill.
        "rounded-full border border-[#747775] h-12 px-5";
  const base = cn(
    "relative inline-flex select-none items-center justify-center gap-2.5 bg-[#000000] text-[#FFFFFF] transition-opacity",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg",
    "disabled:opacity-50 aria-disabled:opacity-50",
    official ? "h-12 border-0 bg-transparent p-0" : shape,
    fullWidth && "w-full",
    className,
  );
  const content = official ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={OFFICIAL_BADGE_SRC[platform]} alt={label} className="h-12 w-auto" />
  ) : (
    <>
      <WalletGlyph />
      {platform === "apple" && locale === "en" ? (
        <span className="flex flex-col items-start leading-none">
          <span className="text-[11px] font-medium tracking-[0.01em]">Add to</span> {/* l10n-ok: official English lockup */}
          <span className="text-[17px] font-semibold tracking-[-0.01em]">Apple Wallet</span>
        </span>
      ) : (
        <span className="text-[15px] font-medium tracking-[0.01em]">{label}</span>
      )}
    </>
  );
  const busy = loading ? (
    <span className="absolute inset-0 flex items-center justify-center rounded-[inherit] bg-[#000000]">
      <Spinner />
    </span>
  ) : null;
  if (href && !disabled && !loading)
    return (
      <a href={href} aria-label={label} className={base} data-wallet={platform}>
        {content}
      </a>
    );
  return (
    <button type="button" aria-label={label} aria-busy={loading || undefined} disabled={disabled || loading} className={base} data-wallet={platform} {...rest}>
      {content}
      {busy}
    </button>
  );
}

export function AddToAppleWalletButton(props: WalletBadgeProps) {
  return <Badge platform="apple" {...props} />;
}

export function AddToGoogleWalletButton(props: WalletBadgeProps) {
  return <Badge platform="google" {...props} />;
}

export interface WalletButtonsProps {
  /** From the user agent: iPhone → Apple only, Android → Google only, other → both (Apple first). */
  os: "ios" | "android" | "other";
  onApple?: () => void;
  onGoogle?: () => void;
  appleHref?: string;
  googleHref?: string;
  busy?: Platform | null;
  /** Hide a platform the server says isn't available (GET /v1/me/wallet → apple/google.available). */
  available?: Partial<Record<Platform, boolean>>;
  className?: string;
}

/**
 * Drop-in for the join flow (/j/<code>) and the web pass:
 *   <WalletButtons os={os} onApple={apple} onGoogle={google} busy={walletBusy} />
 */
export function WalletButtons({ os, onApple, onGoogle, appleHref, googleHref, busy = null, available = {}, className }: WalletButtonsProps) {
  const showApple = os !== "android" && available.apple !== false;
  const showGoogle = os !== "ios" && available.google !== false;
  if (!showApple && !showGoogle) return null;
  return (
    // Both offered: stacked, the same size and weight (neither is the "default"). One alone keeps its natural size.
    <div className={cn("flex flex-col items-stretch gap-3", !(showApple && showGoogle) && "sm:flex-row sm:justify-center", className)}>
      {showApple ? <AddToAppleWalletButton onClick={onApple} href={appleHref} loading={busy === "apple"} disabled={busy === "google"} fullWidth={showApple && showGoogle} /> : null}
      {showGoogle ? <AddToGoogleWalletButton onClick={onGoogle} href={googleHref} loading={busy === "google"} disabled={busy === "apple"} fullWidth={showApple && showGoogle} /> : null}
    </div>
  );
}
