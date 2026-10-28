"use client";
/**
 * "My card" block of the pass (frame 15:184): the member QR in a white block, the member code in mono, one line saying what to do
 * with it, then the wallet buttons. The QR is always black on white (qr-bg / qr-fg), in dark mode too. Wallet passes work as
 * before: Apple downloads the pass, Google redirects to the save URL, and a platform the server can't issue is hidden.
 */
import type { customerApi } from "@ll/shared";
import { Banner } from "@/components/ui/Banner";
import { groupCode } from "@/lib/format"; // l10n-ok: member codes are Latin
import { useLocaleOrEnglish } from "@/lib/i18n/client";
import { useWalletPass } from "./useWalletPass";
import { WalletButtons } from "./WalletButtons";

export function MemberCardBlock({ card, profile }: { card: customerApi.CardResponse | null; profile: customerApi.ProfileDto }) {
  const { t } = useLocaleOrEnglish();
  const { os, available, busy, error: walletError, apple, google } = useWalletPass();
  return (
    <section id="card" aria-labelledby="card-title" className="scroll-mt-4 rounded-card border border-border bg-card p-5 shadow-card">
      <h2 id="card-title" className="sr-only">{t("sh.card.title")}</h2>
      <div className="flex flex-col items-center">
        <div className="rounded-tile border border-border bg-qr-bg p-4 dark:border-transparent">
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
