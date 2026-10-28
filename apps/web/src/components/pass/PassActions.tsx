"use client";
/**
 * The two buttons under the pass card (Figma 32 "Customer pass / Café / 390"): "Show my code" in terracotta opens the code big enough to
 * scan across a counter; "Add to Wallet" in forest adds the pass to this phone's wallet (iPhone: Apple, Android: Google; elsewhere the sheet
 * offers both official buttons, which keep their black brand look). The inline "My card" block below stays on the page.
 */
import { QrCode, Wallet } from "lucide-react";
import { useState } from "react";
import type { customerApi } from "@ll/shared";
import { Banner } from "@/components/ui/Banner";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/cn";
import { groupCode } from "@/lib/format"; // l10n-ok: member codes are Latin
import { useLocaleOrEnglish } from "@/lib/i18n/client";
import { useWalletPass } from "./useWalletPass";
import { WalletButtons } from "./WalletButtons";

const base = "relative inline-flex min-h-[52px] min-w-0 py-2 select-none items-center justify-center gap-2 rounded-full px-4 text-body-strong transition-[background-color,transform,filter] duration-150 ease-out motion-safe:active:scale-[0.98] focus-visible:focus-ring";

export function PassActions({ card, profile }: { card: customerApi.CardResponse | null; profile: customerApi.ProfileDto }) {
  const { t } = useLocaleOrEnglish();
  const [open, setOpen] = useState(false);
  const w = useWalletPass();
  const code = card?.memberCode ?? profile.memberCode;
  const addToWallet = () => {
    if (w.os === "ios" && w.available.apple !== false) void w.apple();
    else if (w.os === "android" && w.available.google !== false) void w.google();
    else setOpen(true);
  };
  return (
    <>
      <div className={cn("grid gap-3", w.canAdd ? "grid-cols-2" : "grid-cols-1")}>
        <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" className={cn(base, "bg-primary text-primary-foreground shadow-glow hover:bg-brand-hover active:bg-brand-pressed")}>
          <QrCode aria-hidden className="size-5 shrink-0" strokeWidth={1.9} />
          <span className="text-center leading-tight">{t("pass.showCode")}</span>
        </button>
        {w.canAdd ? (
          <button type="button" onClick={addToWallet} disabled={!!w.busy} aria-busy={!!w.busy || undefined} className={cn(base, "bg-forest text-forest-foreground hover:brightness-110 disabled:opacity-60")}>
            <Wallet aria-hidden className="size-5 shrink-0" strokeWidth={1.9} />
            <span className="text-center leading-tight">{t("pass.addWallet")}</span>
          </button>
        ) : null}
      </div>
      {w.error && !open ? <Banner tone="neutral">{w.error}</Banner> : null}
      <Modal open={open} onClose={() => setOpen(false)} title={t("sh.card.title")} variant="sheet">
        <div className="flex flex-col items-center gap-4 pt-1">
          <div className="rounded-tile border border-border bg-qr-bg p-4 dark:border-transparent">
            {card?.qrSvg ? <div role="img" aria-label={t("sh.card.cardLabel", { code })} className="size-[min(72vw,260px)] [&>svg]:block [&>svg]:size-full" dangerouslySetInnerHTML={{ __html: card.qrSvg }} /> : <div className="skeleton size-[220px] rounded-md" aria-busy="true" />}
          </div>
          <p dir="ltr" className="font-mono text-title font-semibold tracking-[0.14em] tabular-nums text-foreground">{groupCode(code)}</p>
          <p className="text-center text-meta text-muted-foreground">{t("pass.card.hint")}</p>
          {w.error ? <Banner tone="neutral" className="w-full">{w.error}</Banner> : null}
          {w.canAdd && w.os === "other" ? <WalletButtons os={w.os} onApple={w.apple} onGoogle={w.google} busy={w.busy} available={w.available} className="w-full" /> : null}
        </div>
      </Modal>
    </>
  );
}
