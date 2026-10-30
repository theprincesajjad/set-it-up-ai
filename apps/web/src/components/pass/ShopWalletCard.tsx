"use client";
/**
 * The add-to-wallet moment for one shop's card (join success, the shop page, booking confirmation). docs/engineering/wallet.md.
 *
 *   iPhone   "Add to Apple Wallet" (Safari opens the signed .pkpass and shows the Add sheet)
 *   Android  "Add to Google Wallet" (the save link opens Google Wallet)
 *   computer both, plus a QR that opens this shop on the phone (Apple: "include instructions for opening it on an iPhone")
 *
 * A wallet the server can't issue yet is hidden; with neither, one quiet "coming soon" line (the card on the page still works).
 * Links are fetched fresh on tap: the Apple link lives 10 minutes.
 */
import { Check } from "lucide-react";
import { useEffect, useState } from "react";
import { unitWord, type walletApi } from "@ll/shared";
import { Banner } from "@/components/ui/Banner";
import { QrCode } from "@/components/ui/QrCode";
import { browserApi } from "@/lib/api/browser";
import { cn } from "@/lib/cn";
import { useLocaleOrEnglish } from "@/lib/i18n/client";
import { WalletButtons } from "./WalletButtons";

export type WalletOs = "ios" | "android" | "other";

/** iPhone, iPad (iPadOS says "Macintosh" but has touch), Android, or anything else (a computer). */
export function walletOs(nav: Pick<Navigator, "userAgent" | "maxTouchPoints"> | undefined = typeof navigator === "undefined" ? undefined : navigator): WalletOs {
  if (!nav) return "other";
  const ua = nav.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && (nav.maxTouchPoints ?? 0) > 1)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "other";
}

/** Safari proper (in-app browsers and some third-party ones can't hand a .pkpass to Wallet). */
export const isIosSafari = (ua: string) => /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|Instagram|FBAN|FBAV|Line\//i.test(ua);

export interface ShopWalletCardProps {
  merchantId: string;
  shopName: string;
  slug: string;
  terminology?: string;
  /** Injected in tests; defaults to GET /v1/me/wallet/shops/:merchantId. */
  load?: (merchantId: string) => Promise<walletApi.ShopWalletResponse>;
  /** Forced platform (tests, previews). */
  os?: WalletOs;
  /** Hide the heading and body (the join success screen says it already). */
  bare?: boolean;
  className?: string;
}

const defaultLoad = (id: string) => browserApi.me.shopWallet(id);

export function ShopWalletCard({ merchantId, shopName, slug, terminology = "points", load = defaultLoad, os: forcedOs, bare, className }: ShopWalletCardProps) {
  const { t, locale } = useLocaleOrEnglish();
  const [os, setOs] = useState<WalletOs>(forcedOs ?? "other");
  const [safari, setSafari] = useState(true);
  const [origin, setOrigin] = useState("");
  const [status, setStatus] = useState<walletApi.ShopWalletResponse | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<"apple" | "google" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // The user agent and the origin are only known on the client.
    /* eslint-disable react-hooks/set-state-in-effect */
    if (!forcedOs) setOs(walletOs());
    setSafari(isIosSafari(navigator.userAgent));
    setOrigin(window.location.origin);
    /* eslint-enable react-hooks/set-state-in-effect */
    let alive = true;
    load(merchantId)
      .then((s) => alive && setStatus(s))
      .catch(() => alive && setStatus(null))
      .finally(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
  }, [merchantId, load, forcedOs]);

  if (!loaded) return <div aria-busy="true" className={cn("skeleton h-12 w-full rounded-full", className)} />;
  // Not a member (404) or offline: nothing to offer here; the rest of the page still works.
  if (!status) return null;
  const available = { apple: !!status?.apple.available, google: !!status?.google.available };
  if (!available.apple && !available.google)
    return (
      <p data-testid="wallet-coming-soon" className={cn("text-center text-meta text-fg-muted", className)}>
        {t("wp.wcard.comingSoon", { shop: shopName })}
      </p>
    );

  async function go(p: "apple" | "google") {
    setBusy(p);
    setError(null);
    try {
      const fresh = await load(merchantId);
      const url = fresh[p].url;
      if (!url) throw new Error("unavailable");
      window.location.href = url;
    } catch {
      setError(t("sh.card.walletOff"));
    } finally {
      setBusy(null);
    }
  }

  const showsApple = os !== "android" && available.apple;
  const showsGoogle = os !== "ios" && available.google;
  const inApple = showsApple && status?.apple.added;
  const inGoogle = showsGoogle && status?.google.added;
  const unit = unitWord(locale, terminology);

  return (
    <section data-testid="shop-wallet" data-os={os} aria-label={t("wp.wcard.title", { shop: shopName })} className={cn("flex flex-col items-center gap-3 text-center", className)}>
      {bare ? null : (
        <div className="flex flex-col gap-1">
          <h2 className="text-body-strong text-fg">{t("wp.wcard.title", { shop: shopName })}</h2>
          <p className="text-meta text-fg-muted">{t("wp.wcard.body", { unit })}</p>
        </div>
      )}
      {error ? <Banner tone="neutral">{error}</Banner> : null}
      {inApple || inGoogle ? (
        <p className="inline-flex items-center gap-1.5 text-meta text-fg-muted" data-testid="wallet-added">
          <Check aria-hidden className="size-4 text-positive" strokeWidth={2.25} />
          {inApple ? t("wp.wcard.inApple") : t("wp.wcard.inGoogle")}
        </p>
      ) : null}
      <WalletButtons os={os} onApple={() => go("apple")} onGoogle={() => go("google")} busy={busy} available={available} />
      {os === "ios" && !safari && available.apple ? <p className="text-meta text-fg-muted">{t("wp.wcard.onIphone")}</p> : null}
      {os === "other" && origin ? (
        <div data-testid="wallet-desktop-qr" className="mt-2 flex items-center gap-4 rounded-card border border-line p-4 text-start">
          <div className="shrink-0 rounded-[10px] bg-[#FFFFFF] p-2">
            <QrCode value={`${origin}/shops/${slug}#wallet`} size={104} label={t("wp.wcard.qrAlt")} />
          </div>
          <div className="min-w-0">
            <p className="text-body-strong text-fg">{t("wp.wcard.desktopTitle")}</p>
            <p className="text-meta text-fg-muted">{t("wp.wcard.desktopBody")}</p>
          </div>
        </div>
      ) : null}
    </section>
  );
}
