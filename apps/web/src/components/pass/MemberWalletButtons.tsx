"use client";
/**
 * The wallet pass buttons for a signed-in member outside the join flow (shop page): this phone's wallet only,
 * hidden when the server can't issue that pass (GET /v1/me/wallet → apple/google.available).
 * Presentation is the wallet team's <WalletButtons>.
 */
import { useEffect, useState } from "react";
import { Banner } from "@/components/ui/Banner";
import { browserApi } from "@/lib/api/browser";
import { useLocaleOrEnglish } from "@/lib/i18n/client";
import { platform } from "./JoinFlow";
import { WalletButtons } from "./WalletButtons";

export function MemberWalletButtons({ className }: { className?: string }) {
  const { t } = useLocaleOrEnglish();
  const [os, setOs] = useState<"ios" | "android" | "other">("other");
  const [available, setAvailable] = useState<{ apple?: boolean; google?: boolean } | null>(null);
  const [busy, setBusy] = useState<"apple" | "google" | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    // The UA is only known on the client.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOs(platform());
    browserApi.me
      .wallet()
      .then((s) => setAvailable({ apple: s.apple.available, google: s.google.available }))
      .catch(() => setAvailable({ apple: false, google: false }));
  }, []);
  if (!available) return null;
  const unavailable = t("wp.wallet.off");
  const go = async (p: "apple" | "google") => {
    setBusy(p);
    setError(null);
    try {
      if (p === "google") window.location.href = (await browserApi.me.googleWallet()).saveUrl;
      else {
        const s = await browserApi.me.wallet();
        if (s.apple.available && s.apple.downloadUrl) window.location.href = s.apple.downloadUrl;
        else setError(unavailable);
      }
    } catch {
      setError(unavailable);
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className={className}>
      {error ? <Banner tone="neutral" className="mb-3">{error}</Banner> : null}
      <WalletButtons os={os} onApple={() => go("apple")} onGoogle={() => go("google")} busy={busy} available={available} />
    </div>
  );
}
