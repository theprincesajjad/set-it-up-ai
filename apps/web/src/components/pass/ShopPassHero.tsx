"use client";
/**
 * Top card of the pass (Main Street Warm, Figma 35:2 and 35:199): the shop's trade gradient, awning stripe, the shop's identity, a
 * "Reward ready" pill, the trade's stamps (or a progress bar for a points shop), the big n / goal numeral and the trade's category
 * illustration. It shows ONE shop (the one with a reward ready, else the one closest to its next reward); points are never summed
 * across shops. The shop's own colour appears only inside its avatar. Text sits on the left of the gradient, where it is at most
 * 30% toward the second colour, so it keeps contrast in every trade (light and dark).
 */
import { placeKindLabel, type customerApi } from "@ll/shared";
import { useState } from "react";
import { CategoryIcon } from "@/components/ui/CategoryIcon";
import { StampCard } from "@/components/ui/StampCard";
import { shopInitials } from "@/lib/shopAvatar";
import { formatNumber } from "@/lib/format";
import { unitCaption } from "@/lib/units";
import { useLocaleOrEnglish } from "@/lib/i18n/client";
import { rewardNameIn } from "@/lib/i18n/rewardName";
import { AwningStripe } from "./PassChrome";

/** The shop to feature: a reward ready first, else the highest progress to the next reward, else the first shop. */
export function heroMembership(items: customerApi.MembershipDto[]): customerApi.MembershipDto | null {
  const ready = items.filter((m) => m.rewardsAvailableCount > 0).sort((a, b) => b.rewardsAvailableCount - a.rewardsAvailableCount)[0];
  if (ready) return ready;
  const closest = items
    .filter((m) => m.nextReward && m.nextReward.pointsNeeded > 0)
    .sort((a, b) => b.nextReward!.progressPct - a.nextReward!.progressPct || a.nextReward!.pointsNeeded - b.nextReward!.pointsNeeded)[0];
  return closest ?? items[0] ?? null;
}

/** The shop's square white tile on the gradient: its logo, else its initials in the trade colour. */
function PassLogo({ shop }: { shop: customerApi.MerchantBriefDto }) {
  const [failed, setFailed] = useState(false);
  return shop.logoUrl && !failed ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={shop.logoUrl} alt="" width={52} height={52} onError={() => setFailed(true)} className="size-[52px] shrink-0 rounded-2xl bg-card object-cover" />
  ) : (
    <span aria-hidden className="inline-flex size-[52px] shrink-0 select-none items-center justify-center rounded-2xl bg-trade-pass-text text-body-strong font-extrabold tracking-wide text-trade-pass-from">
      {shopInitials(shop.name)}
    </span>
  );
}

export function ShopPassHero({ m, line, footer }: { m: customerApi.MembershipDto; /** Line under the numeral (points needed, expiry rule). */ line: string | null; footer?: React.ReactNode }) {
  const { t, locale } = useLocaleOrEnglish();
  const next = m.nextReward;
  const ready = m.rewardsAvailableCount > 0;
  const stampGoal = m.program?.earnType === "stamps" ? Math.min(12, m.program.stampGoal) : 0;
  const goal = next?.pointsCost ?? (ready ? Math.max(1, m.balance) : 0);
  const shown = goal > 0 ? Math.min(m.balance, goal) : m.balance;
  const unit = unitCaption(locale, m.balance, m.terminology);
  // A long total ("1,190 / 1,190") steps down so it never runs under the illustration.
  const digits = `${formatNumber(shown)}${goal > 0 ? ` / ${formatNumber(goal)}` : ""}`.length;
  const numeral = digits > 12 ? "text-[28px]" : digits > 9 ? "text-[40px]" : digits > 7 ? "text-[46px]" : "text-[54px]";
  const pct = goal > 0 ? Math.round((shown / goal) * 100) : 0;
  return (
    <section
      aria-label={m.merchant.name}
      data-trade={m.merchant.vertical}
      className="overflow-hidden rounded-sheet bg-[linear-gradient(100deg,var(--trade-pass-from)_60%,var(--trade-pass-to)_100%)] text-trade-pass-text shadow-card">
      <AwningStripe />
      <div className="flex flex-col gap-5 p-5 pt-4">
        <div className="flex items-center gap-3">
          <PassLogo shop={m.merchant} />
          <div className="min-w-0 flex-1">
            <h2 className="text-headline font-semibold leading-tight"><bdi>{m.merchant.name}</bdi></h2>
            <p className="mt-0.5 truncate text-meta text-current/90">{placeKindLabel(locale, m.merchant.vertical)}</p>
          </div>
          {ready ? (
            <span className="shrink-0 rounded-full bg-tile-butter px-3 py-1.5 text-meta-strong font-bold text-tile-butter-foreground">
              {m.rewardsAvailableCount > 1 ? t("sh.wallet.rewardsReadyN", { n: m.rewardsAvailableCount }) : t("sh.wallet.rewardReady")}
            </span>
          ) : null}
        </div>
        {stampGoal > 0 ? (
          <StampCard bare frame="plain" tone="onTrade" stamps={m.balance} goal={stampGoal} vertical={m.merchant.vertical} terminology={m.terminology} rewardName={next ? rewardNameIn(locale, t, next.name) : undefined} />
        ) : goal > 0 ? (
          <div
            role="progressbar"
            aria-label={t("pass.hero.next")}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            className="h-2.5 w-full overflow-hidden rounded-full bg-current/25"
          >
            <div className="h-full rounded-full bg-current" style={{ width: `${pct}%` }} />
          </div>
        ) : null}
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className={`font-display ${numeral} font-bold leading-none tracking-tight tabular-nums`}>
              {formatNumber(shown)}
              {goal > 0 ? <span className="mx-1.5 font-normal opacity-90">/</span> : null}
              {goal > 0 ? formatNumber(goal) : null}
            </p>
            <p className="mt-2 text-body text-current/95">{line ?? unit}</p>
            {next && !line ? <p className="mt-1 text-meta text-current/90">{rewardNameIn(locale, t, next.name)}</p> : null}
          </div>
          <CategoryIcon vertical={m.merchant.vertical} size={64} className="mb-1 shrink-0 drop-shadow-md max-[340px]:hidden" />
        </div>
      </div>
      {footer ? <div className="border-t border-current/25 px-5 py-3 text-meta text-current/95">{footer}</div> : null}
    </section>
  );
}
