"use client";
/**
 * Top card of the pass (frame 15:184): awning stripe, the shop's identity, the points ring and the next reward.
 * It shows ONE shop (the one with a reward ready, else the one closest to its next reward); points are never summed across shops.
 * The shop's own colour appears only inside its avatar.
 */
import { placeKindLabel, type customerApi } from "@ll/shared";
import { PointsRing } from "@/components/ui/PointsRing";
import { ShopLogo } from "@/components/ui/ShopTile";
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

export function ShopPassHero({ m, line, footer }: { m: customerApi.MembershipDto; /** Grey line under the next reward (points needed, expiry rule). */ line: string | null; footer?: React.ReactNode }) {
  const { t, locale } = useLocaleOrEnglish();
  const next = m.nextReward;
  const ready = m.rewardsAvailableCount > 0;
  return (
    <section aria-label={m.merchant.name} className="overflow-hidden rounded-card border border-border bg-card">
      <AwningStripe />
      <div className="flex flex-col gap-5 p-5">
        <div className="flex items-center gap-3">
          <ShopLogo shop={m.merchant} size={48} />
          <div className="min-w-0 flex-1">
            <h2 className="text-headline font-semibold text-foreground"><bdi>{m.merchant.name}</bdi></h2>
            <p className="flex items-center gap-1.5 text-meta text-muted-foreground">
              {ready ? (
                <>
                  <span aria-hidden className="size-2 shrink-0 rounded-full bg-points" />
                  <span className="font-semibold text-points-text">{m.rewardsAvailableCount > 1 ? t("sh.wallet.rewardsReadyN", { n: m.rewardsAvailableCount }) : t("sh.wallet.rewardReady")}</span>
                </>
              ) : (
                <span className="italic">{placeKindLabel(locale, m.merchant.vertical)}</span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-5">
          <PointsRing balance={m.balance} goal={next?.pointsCost ?? (ready ? Math.max(1, m.balance) : 0)} terminology={m.terminology} rewardName={next ? rewardNameIn(locale, t, next.name) : null} size={120} showCaption={false} className="shrink-0" />
          <div className="min-w-0 flex-1">
            {next ? (
              <>
                <p className="text-meta-strong text-muted-foreground">{t("pass.hero.next")}</p>
                <p className="mt-1 text-headline font-semibold text-foreground">{rewardNameIn(locale, t, next.name)}</p>
              </>
            ) : null}
            {line ? <p className="mt-1 text-meta text-muted-foreground">{line}</p> : null}
          </div>
        </div>
      </div>
      {footer ? <div className="border-t border-border px-5 py-3 text-meta text-muted-foreground">{footer}</div> : null}
    </section>
  );
}
