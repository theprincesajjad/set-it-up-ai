"use client";
import { Check } from "lucide-react";
import { useState, type ReactNode } from "react";
import { PointsRing } from "@/components/ui/PointsRing";
import { RewardCard } from "@/components/ui/RewardCard";
import { ShopLogo, ShopTile } from "@/components/ui/ShopTile";
import { StampCard } from "@/components/ui/StampCard";
import { formatNumber, formatPoints, rewardInSentence } from "@/lib/format";
import type { PreviewModel } from "@/lib/dashboard/program";
import { Segmented } from "./kit";
import { WalletPassPreview } from "./program/WalletPassPreview";

export type PreviewView = "pass" | "wallet" | "shop" | "counter";

/** 320 x 640 phone: hairline device, white screen, no heavy bezel or shadow. */
export function PhoneFrame({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div role="group" aria-label={label} className="mx-auto w-[320px] max-w-full rounded-[46px] border border-line bg-bg-subtle p-2">
      <div className="flex h-[620px] flex-col overflow-hidden rounded-[38px] border border-line bg-bg">
        <div aria-hidden className="flex h-9 shrink-0 items-center justify-between px-6 text-[11px] font-semibold text-fg">
          <span className="tabular">9:41</span>
          <span className="h-[18px] w-[72px] rounded-full bg-fg" />
          <span className="flex items-center gap-1">
            <span className="h-2 w-3 rounded-[2px] bg-fg" />
            <span className="h-2 w-4 rounded-[3px] border border-fg" />
          </span>
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-5 pt-2">{children}</div>
      </div>
    </div>
  );
}

interface Shop {
  name: string;
  vertical: string;
  logoUrl?: string | null;
  brandColor?: string | null;
}

/** The wallet row's one line, as the app writes it: "4 more for a free drink" / "120 pts to $5 off" (D13). */
function progressSubtitle(model: PreviewModel): string {
  if (model.kind === "stamps") return model.goal - model.stamps > 0 ? `${model.goal - model.stamps} more for a ${rewardInSentence(model.rewardName)}` : "reward ready";
  if (!model.rewardName || model.goal <= 0) return model.expiry;
  return model.balance >= model.goal ? "reward ready" : `${model.goal - model.balance} ${model.terminology === "points" ? "pts" : model.terminology} to ${rewardInSentence(model.rewardName)}`;
}

/** Renders the real (v2) customer components with the draft program: wallet, shop page, counter success. */
export function ProgramPreview({ model, shop, view: viewProp, onViewChange, defaultView = "wallet" }: { model: PreviewModel; shop: Shop; view?: PreviewView; onViewChange?: (v: PreviewView) => void; defaultView?: PreviewView }) {
  const [inner, setInner] = useState<PreviewView>(defaultView);
  const view = viewProp ?? inner;
  const setView = onViewChange ?? setInner;
  const header = (
    <span className="flex items-center gap-2">
      <ShopLogo shop={shop} size={24} />
      <span className="truncate text-meta-strong text-fg">{shop.name}</span>
    </span>
  );
  const card =
    model.kind === "stamps" ? (
      <StampCard stamps={model.stamps} goal={model.goal} rewardName={model.rewardName} vertical={shop.vertical} terminology={model.terminology} header={header} />
    ) : (
      <div className="flex flex-col items-center gap-2 rounded-card border border-line bg-bg p-4">
        <div className="self-start">{header}</div>
        <PointsRing balance={model.balance} goal={model.goal} terminology={model.terminology} rewardName={model.rewardName} size={120} />
      </div>
    );
  const balance = model.kind === "stamps" ? model.stamps : model.balance;
  const rewards = model.rewards.slice(0, 3).map((r) => (
    <RewardCard key={r.name + r.pointsCost} reward={r} balance={balance} terminology={model.terminology} state={view === "shop" ? "preview" : balance >= r.pointsCost ? "available" : "locked"} onRedeem={() => undefined} />
  ));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-center">
        <Segmented
          label="Preview"
          value={view}
          onChange={setView}
          options={
            defaultView === "pass"
              ? [
                  { value: "pass", label: "Wallet pass" },
                  { value: "counter", label: "Counter" },
                  { value: "shop", label: "Shop page" },
                ]
              : [
                  { value: "wallet", label: "Wallet" },
                  { value: "shop", label: "Shop page" },
                  { value: "counter", label: "Counter success" },
                ]
          }
        />
      </div>
      {view === "pass" ? (
        <WalletPassPreview model={model} shop={shop} />
      ) : (
      <PhoneFrame label={`Customer preview: ${view}`}>
        {view === "wallet" ? (
          <div className="flex flex-col gap-3">
            <p className="font-display text-large-title lowercase text-fg">wallet</p>
            <ShopTile variant="wallet" shop={shop} balance={{ value: balance, terminology: model.terminology }} rewardReady={model.kind === "points" ? model.goal > 0 && model.balance >= model.goal : false} subtitle={progressSubtitle(model)} />
            {card}
            {rewards}
            <p className="text-caption font-normal text-fg-muted">{model.expiry}</p>
          </div>
        ) : null}
        {view === "shop" ? (
          <div className="flex flex-col gap-3">
            <ShopTile variant="list" shop={shop} subtitle="Open · closes 6 pm" />
            {model.welcome ? <p className="self-start rounded-full bg-accent-soft px-3 py-1 text-meta-strong text-accent-text">{model.welcome}</p> : null}
            <div className="border-y border-line py-3">
              <p className="text-headline text-fg">How you earn here</p>
              <p className="mt-1 text-meta text-fg">{model.sentence}</p>
              <p className="mt-2 text-caption font-normal text-fg-muted">{model.expiry}</p>
            </div>
            {rewards}
          </div>
        ) : null}
        {view === "counter" ? (
          <div className="flex h-full flex-col gap-4 pt-6">
            <span aria-hidden className="inline-flex size-10 items-center justify-center rounded-full bg-fg text-bg">
              <Check className="size-5" strokeWidth={2.25} />
            </span>
            <div>
              <p className="text-title text-fg">{model.kind === "stamps" ? `Added ${model.lastEarn} stamp${model.lastEarn === 1 ? "" : "s"}` : `Awarded ${formatPoints(model.lastEarn, model.terminology)}`}</p>
              <p className="mt-3 font-display text-display-number text-accent-text tabular">{formatNumber(balance)}</p>
              <p className="text-meta text-fg-muted">
                Sam has {formatPoints(balance, model.terminology)}
                {model.kind === "stamps" ? ` · ${model.goal - model.stamps} more for a ${model.rewardName.toLowerCase()}` : model.rewardName ? (model.balance >= model.goal ? ` · ${model.rewardName} ready` : ` · ${model.goal - model.balance} to ${model.rewardName}`) : ""}
              </p>
            </div>
            <p className="mt-auto text-caption font-normal text-fg-muted">What staff see after an award. Customers get the same balance on their card.</p>
          </div>
        ) : null}
      </PhoneFrame>
      )}
    </div>
  );
}
