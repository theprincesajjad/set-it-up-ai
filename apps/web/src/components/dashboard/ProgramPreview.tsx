"use client";
import { CheckCircle2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { PointsRing } from "@/components/ui/PointsRing";
import { RewardCard } from "@/components/ui/RewardCard";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { ShopLogo, ShopTile } from "@/components/ui/ShopTile";
import { StampCard } from "@/components/ui/StampCard";
import { formatPoints } from "@/lib/format";
import type { PreviewModel } from "@/lib/dashboard/program";

export type PreviewView = "wallet" | "shop" | "counter";

/** 320 x 640 phone frame, radius 40, 8px fg bezel (merchant-dashboard.md §5). */
export function PhoneFrame({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div role="group" aria-label={label} className="mx-auto w-[320px] max-w-full rounded-[40px] border-8 border-fg bg-canvas shadow-lg">
      <div className="flex h-[624px] flex-col overflow-hidden rounded-[32px]">
        <div aria-hidden className="mx-auto mt-2 h-5 w-24 shrink-0 rounded-full bg-fg" />
        <div className="flex-1 overflow-y-auto px-3 pb-4 pt-3">{children}</div>
      </div>
    </div>
  );
}

interface Shop {
  name: string;
  vertical: string;
  logoUrl?: string | null;
}

/** Renders the real customer components with the draft program (wallet, shop page, counter success). */
export function ProgramPreview({ model, shop, view: viewProp, onViewChange }: { model: PreviewModel; shop: Shop; view?: PreviewView; onViewChange?: (v: PreviewView) => void }) {
  const [inner, setInner] = useState<PreviewView>("wallet");
  const view = viewProp ?? inner;
  const setView = onViewChange ?? setInner;
  const header = (
    <span className="flex items-center gap-2">
      <ShopLogo shop={shop} size={24} />
      <span className="truncate text-label text-fg">{shop.name}</span>
    </span>
  );
  const card =
    model.kind === "stamps" ? (
      <StampCard stamps={model.stamps} goal={model.goal} rewardName={model.rewardName} vertical={shop.vertical} terminology={model.terminology} header={header} />
    ) : (
      <div className="flex flex-col items-center gap-2 rounded-lg bg-surface p-4 shadow-sm">
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
        <SegmentedControl
          label="Preview"
          value={view}
          onChange={setView}
          options={[
            { value: "wallet", label: "Wallet" },
            { value: "shop", label: "Shop page" },
            { value: "counter", label: "Counter success" },
          ]}
        />
      </div>
      <PhoneFrame label={`Customer preview: ${view}`}>
        {view === "wallet" ? (
          <div className="flex flex-col gap-3">
            <p className="text-h3 text-fg">My shops</p>
            <ShopTile variant="wallet" shop={shop} balance={{ value: balance, terminology: model.terminology }} rewardReady={model.kind === "points" ? model.goal > 0 && model.balance >= model.goal : false} subtitle={model.sentence.split(". ")[0]} />
            {card}
            {rewards}
            <p className="text-caption text-fg-muted">{model.expiry}</p>
          </div>
        ) : null}
        {view === "shop" ? (
          <div className="flex flex-col gap-3">
            <ShopTile variant="list" shop={shop} subtitle="Open · closes 6 pm" />
            {model.welcome ? <p className="self-start rounded-full bg-accent-subtle px-3 py-1 text-label text-on-accent-subtle">{model.welcome}</p> : null}
            <div className="rounded-lg bg-surface p-4 shadow-sm">
              <p className="text-title text-fg">How you earn here</p>
              <p className="mt-1 text-body-sm text-fg">{model.sentence}</p>
              <p className="mt-2 text-caption text-fg-muted">{model.expiry}</p>
            </div>
            {rewards}
          </div>
        ) : null}
        {view === "counter" ? (
          <div className="flex h-full flex-col gap-3">
            <div className="rounded-lg bg-success p-5 text-on-success">
              <CheckCircle2 aria-hidden className="size-8" />
              <p className="mt-2 text-h2">{model.kind === "stamps" ? `Added ${model.lastEarn} stamp${model.lastEarn === 1 ? "" : "s"}` : `Awarded ${formatPoints(model.lastEarn, model.terminology)}`}</p>
              <p className="mt-1 text-body">
                Sam has {formatPoints(balance, model.terminology)}
                {model.kind === "stamps" ? ` · ${model.goal - model.stamps} more for a ${model.rewardName.toLowerCase()}` : model.rewardName ? ` · ${Math.max(0, model.goal - model.balance)} to ${model.rewardName}` : ""}
              </p>
            </div>
            <p className="text-caption text-fg-muted">What staff see after an award. Customers get the same balance on their card.</p>
          </div>
        ) : null}
      </PhoneFrame>
    </div>
  );
}
