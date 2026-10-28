"use client";
/**
 * "My card" block of the pass (frame 15:184): the member QR in a white block, the member code in mono, one line saying what to do
 * with it, then the wallet buttons. The QR is always black on white (qr-bg / qr-fg), in dark mode too. Wallet passes work as
 * before: Apple downloads the pass, Google redirects to the save URL, and a platform the server can't issue is hidden.
 */
import { useEffect, useState } from "react";
import type { customerApi } from "@ll/shared";
import { Banner } from "@/components/ui/Banner";
import { browserApi } from "@/lib/api/browser";
import { groupCode } from "@/lib/format"; // l10n-ok: member codes are Latin
import { useLocaleOrEnglish } from "@/lib/i18n/client";
import { platform } from "./JoinFlow";
import { WalletButtons } from "./WalletButtons";

export function MemberCardBlock({ card, profile }: { card: customerApi.CardResponse | null; profile: customerApi.ProfileDto }) {
  const { t } = useLocaleOrEnglish();
  const [walletError, setWalletError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"apple" | "google" | null>(null);
  const [available, setAvailable] = useState<{ apple?: boolean; google?: boolean }>({});
  const [os, setOs] = useState<"ios" | "android" | "other">("other");
  useEffect(() => {
    // The UA is only known on the client.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOs(platform());
    browserApi.me
      .wallet()
      .then((s) => setAvailable({ apple: s.apple.available, google: s.google.available }))
      .catch(() => undefined);
  }, []);
  const unavailable = t("sh.card.walletOff");
  async function google() {
    setBusy("google");
    try {
      const r = await browserApi.me.googleWallet();
      window.location.href = r.saveUrl;
    } catch {
      setWalletError(unavailable);
    } finally {
      setBusy(null);
    }
  }
  async function apple() {
    setBusy("apple");
    try {
      const s = await browserApi.me.wallet();
      if (s.apple.available && s.apple.downloadUrl) window.location.href = s.apple.downloadUrl;
      else setWalletError(unavailable);
    } catch {
      setWalletError(unavailable);
    } finally {
      setBusy(null);
    }
  }
  return (
    <section id="card" aria-labelledby="card-title" className="scroll-mt-4 rounded-card border border-border bg-card p-5">
      <h2 id="card-title" className="sr-only">{t("sh.card.title")}</h2>
      <div className="flex flex-col items-center">
        <div className="rounded-xl border border-border bg-qr-bg p-4 dark:border-transparent">
          {card?.qrSvg ? (
            <div role="img" aria-label={t("sh.card.cardLabel", { code: card.memberCode })} className="size-[200px] [&>svg]:block [&>svg]:size-full" dangerouslySetInnerHTML={{ __html: card.qrSvg }} />
          ) : (
            <div className="skeleton size-[200px] rounded-md" aria-busy="true" />
          )}
        </div>
        <p dir="ltr" className="mt-5 font-mono text-title font-semibold tracking-[0.14em] text-foreground tabular-nums">{groupCode(card?.memberCode ?? profile.memberCode)}</p>
        <p className="mt-1 text-center text-meta text-muted-foreground">{t("pass.card.hint")}</p>
      </div>
      {walletError ? <Banner tone="neutral" className="mt-4 w-full">{walletError}</Banner> : null}
      <WalletButtons os={os} onApple={apple} onGoogle={google} busy={busy} available={available} className="mt-5 w-full" />
    </section>
  );
}
