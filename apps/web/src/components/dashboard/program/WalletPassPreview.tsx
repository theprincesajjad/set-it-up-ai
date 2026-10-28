"use client";
import { Check } from "lucide-react";
import { ShopLogo } from "@/components/ui/ShopTile";
import { cn } from "@/lib/cn";
import { stampsLeft } from "@/lib/dashboard/counter";
import type { PreviewModel } from "@/lib/dashboard/program";

interface Shop {
  name: string;
  vertical: string;
  logoUrl?: string | null;
  brandColor?: string | null;
}

/**
 * The Wallet pass as customers carry it: the same layout wallet-png.ts draws (shop and count on top, stamp grid with the
 * last cell marked FREE, one line of what is left, the QR). Stamp programs only; points programs show the balance.
 */
export function WalletPassPreview({ model, shop, memberCode = "1034" }: { model: PreviewModel; shop: Shop; memberCode?: string }) {
  const stamps = model.kind === "stamps";
  const goal = model.goal;
  const filled = stamps ? model.stamps : 0;
  const cells = Array.from({ length: Math.max(1, goal) }, (_, i) => i);
  const last = cells.length - 1;
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-[20px] border border-line bg-bg p-5">
        <div className="flex items-center justify-between gap-3">
          <span className="flex min-w-0 items-center gap-2">
            <ShopLogo shop={shop} size={32} />
            <span className="truncate text-[14px] font-semibold text-fg">{shop.name}</span>
          </span>
          <span className="shrink-0 text-[13px] font-semibold tabular-nums text-points-text">{stamps ? `${filled} / ${goal}` : `${model.balance} ${model.terminology === "points" ? "pts" : model.terminology}`}</span>
        </div>
        {stamps ? (
          <div role="img" aria-label={`${filled} of ${goal} stamps. ${stampsLeft(goal - filled, model.rewardName)}`} className="mt-5 grid grid-cols-5 justify-items-center gap-x-2.5 gap-y-3">
            {cells.map((i) => {
              const on = i < filled;
              return (
                <span
                  key={i}
                  aria-hidden
                  className={cn("inline-flex size-11 items-center justify-center rounded-full text-[13px] font-medium", on ? "bg-points text-points-foreground" : "text-fg-muted shadow-[inset_0_0_0_1.5px_var(--ll-color-line)]", i === last && !on && "text-[10px] font-semibold uppercase tracking-wide")}
                >
                  {on ? <Check className="size-5" strokeWidth={3} /> : i === last ? "Free" : i + 1}
                </span>
              );
            })}
          </div>
        ) : (
          <p className="mt-4 text-[13px] text-fg-muted">{model.rewardName ? (model.balance >= model.goal ? `${model.rewardName} ready to redeem` : `${model.goal - model.balance} to ${model.rewardName}`) : model.sentence}</p>
        )}
        {stamps ? <p className="mt-4 text-[14px] font-medium text-fg">{stampsLeft(goal - filled, model.rewardName)}</p> : null}
        <div className="mt-4 flex h-[100px] items-center justify-center rounded-[14px] bg-bg-subtle text-[13px] text-fg-muted">QR code · {memberCode}</div>
      </div>
      <button type="button" tabIndex={-1} aria-disabled className="inline-flex h-[46px] cursor-default items-center justify-center rounded-full bg-primary px-5 text-[14px] font-medium text-primary-foreground">
        Add to Apple Wallet
      </button>
      <p className="text-[12px] text-fg-muted">Same pass for Google Wallet. {stamps ? "Stamps" : "Your balance"} update on the lock screen.</p>
    </div>
  );
}
