import { BadgePercent, Gift, type LucideIcon } from "lucide-react";
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
}

const icons: Record<RewardCardReward["rewardType"], LucideIcon> = { amount_off: BadgePercent, percent_off: BadgePercent, free_item: Gift, custom: Gift };

export function RewardCard({ reward, balance = 0, terminology, state, onRedeem, redeemedAt, children, className }: RewardCardProps) {
  const Icon = icons[reward.rewardType];
  const toGo = Math.max(0, reward.pointsCost - balance);
  return (
    <div className={cn("rounded-lg bg-surface p-4 shadow-sm", className)}>
      <div className="flex items-center gap-3">
        <span aria-hidden className="flex size-14 shrink-0 items-center justify-center rounded-md bg-accent-subtle text-on-accent-subtle">
          <Icon className="size-6" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-title text-fg">{reward.name}</p>
          <p className="text-body-sm text-fg-muted">{formatPoints(reward.pointsCost, terminology)}</p>
        </div>
        {state === "available" && onRedeem ? (
          <Button variant="accent" size="sm" onClick={onRedeem}>
            Redeem
          </Button>
        ) : null}
        {state === "redeemed" ? <Badge tone="success">{redeemedAt ? `Redeemed ${formatDate(redeemedAt)}` : "Redeemed"}</Badge> : null}
      </div>
      {state === "locked" ? (
        <div className="mt-3">
          <ProgressBar value={Math.min(balance, reward.pointsCost)} max={reward.pointsCost} tone="accent" showValue={false} valueText={`${balance} of ${reward.pointsCost} ${terminology}`} />
          <p className="mt-1.5 text-body-sm text-fg-muted">{formatPoints(toGo, terminology)} to go</p>
        </div>
      ) : null}
      {reward.description || reward.terms ? <p className="mt-2 text-caption text-fg-muted">{reward.terms ?? reward.description}</p> : null}
      {state === "redeeming" ? <div className="mt-3">{children}</div> : null}
    </div>
  );
}
