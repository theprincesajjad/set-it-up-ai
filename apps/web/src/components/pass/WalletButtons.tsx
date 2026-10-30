"use client";
/**
 * "Add to Apple Wallet" / "Add to Google Wallet" buttons (owned by the wallet team). docs/engineering/wallet.md.
 *
 * Google (developers.google.com/wallet/retail/loyalty-cards/resources/brand-guidelines): the official button artwork only,
 * shipped in public/wallet-badges/ from Google's asset zip (en-CA, and Urdu; Hindi and Punjabi have no localized button, so the
 * guideline says English). Black, never recoloured or re-typeset, at least 48 px tall, at least 8 px clear space, never smaller
 * than the buttons around it. Label: "Add to Google Wallet" ("Save to Google Wallet" is no longer approved).
 *
 * Apple (developer.apple.com/wallet/add-to-apple-wallet-guidelines): only Apple's badge files, and the licence covers them only
 * while we are in the Apple Developer Program, so the founder downloads them after enrolling (docs/engineering/wallet.md):
 *   public/wallet-badges/add-to-apple-wallet-en-CA.svg   then NEXT_PUBLIC_WALLET_BADGES=1
 * Until then a neutral black button with the official wording stands in (no imitation of Apple's badge). Clear space ≥ 0.1× the
 * badge height (the 12 px gap), never dominant, never dimmed except while busy.
 *
 * Show only the phone's own wallet when we know it (iPhone → Apple, Android → Google); both on a computer.
 */
import type { ButtonHTMLAttributes } from "react";
import { walletApi } from "@ll/shared";
import { cn } from "@/lib/cn";
import { useLocaleOrEnglish } from "@/lib/i18n/client";
import { Spinner } from "@/components/ui/Spinner";

const APPLE_OFFICIAL = process.env.NEXT_PUBLIC_WALLET_BADGES === "1";
type Locale = "en" | "hi" | "ur" | "pa";
/** Google ships an Urdu button; Hindi and Punjabi fall back to English (per Google's guideline). */
export const googleBadgeSrc = (locale: Locale) => (locale === "ur" ? "/wallet-badges/add-to-google-wallet-ur.svg" : "/wallet-badges/add-to-google-wallet-en-CA.svg");
/** Apple's badge file, once the founder adds it. One file (en-CA) until the localized badges are added and listed here. */
export const appleBadgeSrc = (): string => "/wallet-badges/add-to-apple-wallet-en-CA.svg";
/** @deprecated kept for callers that read the paths; use googleBadgeSrc / appleBadgeSrc. */
export const OFFICIAL_BADGE_SRC = { apple: appleBadgeSrc(), google: googleBadgeSrc("en") } as const;

type Platform = "apple" | "google";

export interface WalletBadgeProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  loading?: boolean;
  /** Render as a link instead (e.g. a signed .pkpass URL or the Google save URL). */
  href?: string;
  fullWidth?: boolean;
  /** Force the stand-in even when official artwork is enabled (tests, previews). */
  placeholder?: boolean;
}

/** Neutral wallet glyph for the Apple stand-in (not Apple's artwork). */
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
  const label = locale === "en" ? walletApi.WALLET_BUTTON_TEXT[platform] : t(platform === "apple" ? "ms.wallet.addApple" : "ms.wallet.addGoogle");
  const official = !placeholder && (platform === "google" || APPLE_OFFICIAL);
  const src = platform === "google" ? googleBadgeSrc(locale as Locale) : appleBadgeSrc();
  const base = cn(
    "relative inline-flex min-h-12 select-none items-center justify-center transition-opacity",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg",
    "disabled:cursor-default aria-disabled:cursor-default",
    official ? "h-12 rounded-full bg-transparent p-0" : "h-12 gap-2.5 rounded-[10px] border border-[#A6A6A6] bg-[#000000] px-5 text-[#FFFFFF]",
    fullWidth && !official && "w-full",
    className,
  );
  const content = official ? (
    // The artwork is the label: never stretched (h-12, width from its own aspect ratio).
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={label} className="block h-12 w-auto max-w-full" draggable={false} />
  ) : (
    <>
      <WalletGlyph />
      <span className="text-[15px] font-medium tracking-[0.01em]">{label}</span>
    </>
  );
  const busy = loading ? (
    <span className="absolute inset-0 flex items-center justify-center rounded-[inherit] bg-[#000000]">
      <Spinner />
    </span>
  ) : null;
  if (href && !disabled && !loading)
    return (
      <a href={href} aria-label={label} className={base} data-wallet={platform} data-official={official ? "1" : undefined}>
        {content}
      </a>
    );
  return (
    <button type="button" aria-label={label} aria-busy={loading || undefined} disabled={disabled || loading} className={base} data-wallet={platform} data-official={official ? "1" : undefined} {...rest}>
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
  /** Hide a platform the server says isn't available. */
  available?: Partial<Record<Platform, boolean>>;
  className?: string;
}

/**
 * Drop-in for the join flow, the shop page and the web pass:
 *   <WalletButtons os={os} onApple={apple} onGoogle={google} busy={walletBusy} />
 */
export function WalletButtons({ os, onApple, onGoogle, appleHref, googleHref, busy = null, available = {}, className }: WalletButtonsProps) {
  const showApple = os !== "android" && available.apple !== false;
  const showGoogle = os !== "ios" && available.google !== false;
  if (!showApple && !showGoogle) return null;
  return (
    // Both offered: side by side when they fit, the same height (neither is the "default"). 12 px apart = the clear space both brands ask for.
    <div className={cn("flex flex-wrap items-center justify-center gap-3", className)} data-testid="wallet-buttons">
      {showApple ? <AddToAppleWalletButton onClick={onApple} href={appleHref} loading={busy === "apple"} disabled={busy === "google"} /> : null}
      {showGoogle ? <AddToGoogleWalletButton onClick={onGoogle} href={googleHref} loading={busy === "google"} disabled={busy === "apple"} /> : null}
    </div>
  );
}
