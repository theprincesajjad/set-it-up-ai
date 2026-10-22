import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { formatDate, formatPoints } from "@/lib/format";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { ProgressBar } from "./ProgressBar";

export interface RewardCardReward {
  name: string;
  pointsCost: number;
  rewardType: "amount_off" | "percent_off" | "free_item" | "custom";
  value: number;
  terms?: string | null;
  description?: string | null;
}

export interface RewardCardProps {
  reward: RewardCardReward;
  balance?: number;
  terminology: string;
  /** "preview" = public shop page (no balance, no button). */
  state: "available" | "locked" | "redeeming" | "redeemed" | "preview";
  onRedeem?: () => void;
  redeemedAt?: string | null;
  /** Rendered while `redeeming` (usually <RedeemCode/>). */
  children?: ReactNode;
  className?: string;
  /** "card" (hairline block, default) or "row" (inside a ListGroup). */
  layout?: "card" | "row";
}

/** A reward: name + cost; a Redeem button when affordable, thin progress when not. No icon tiles. */
export function RewardCard({ reward, balance = 0, terminology, state, onRedeem, redeemedAt, children, className, layout = "card" }: RewardCardProps) {
  const toGo = Math.max(0, reward.pointsCost - balance);
  return (
    <div className={cn(layout === "card" ? "rounded-card border border-line bg-bg p-4" : "py-3.5", className)}>
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-body-strong text-fg">{reward.name}</p>
          <p className="text-meta tabular-nums text-fg-muted">
            {state === "available" ? <span className="font-semibold text-accent-text">Ready · </span> : null}
            {formatPoints(reward.pointsCost, terminology)}
          </p>
        </div>
        {state === "available" && onRedeem ? (
          <Button size="sm" onClick={onRedeem}>
            Redeem
          </Button>
        ) : null}
        {state === "locked" ? <span className="shrink-0 text-meta tabular-nums text-fg-muted">{formatPoints(toGo, terminology)} to go</span> : null}
        {state === "redeemed" ? <Badge tone="neutral">{redeemedAt ? `Redeemed ${formatDate(redeemedAt)}` : "Redeemed"}</Badge> : null}
      </div>
      {state === "locked" ? (
        <ProgressBar className="mt-3" value={Math.min(balance, reward.pointsCost)} max={reward.pointsCost} showValue={false} valueText={`${balance} of ${reward.pointsCost} ${terminology}`} />
      ) : null}
      {reward.description || reward.terms ? <p className="mt-2 text-meta text-fg-muted">{reward.terms ?? reward.description}</p> : null}
      {state === "redeeming" ? <div className="mt-3">{children}</div> : null}
    </div>
  );
}
