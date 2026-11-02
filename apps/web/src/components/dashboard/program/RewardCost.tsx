"use client";
/**
 * What the reward costs the shop, as a share of what members spend (docs/research/grocers.md, frame D3). A grocer nets about 2%,
 * so 1% back would be half the profit: the line says it in dollars of spend before anything is saved.
 */
import { GROCER_NET_MARGIN_PCT, rewardBackPct } from "@ll/shared";
import { Panel } from "@/components/dashboard/kit";
import { Meter, MeterIndicator, MeterTrack } from "@/components/primitives/meter";
import { rewardCostLine } from "@/lib/grocery";

export function RewardCost({ pointsPerDollar, pointsCost, rewardValueCents }: { pointsPerDollar: number; pointsCost: number; rewardValueCents: number }) {
  const pct = rewardBackPct(pointsPerDollar, pointsCost, rewardValueCents);
  const line = rewardCostLine(pointsPerDollar, pointsCost, rewardValueCents);
  if (pct == null || !line) return null;
  const spend = Math.round(pointsCost / pointsPerDollar);
  const share = Math.min(100, (pct / (GROCER_NET_MARGIN_PCT * 2)) * 100);
  const high = pct >= GROCER_NET_MARGIN_PCT / 2;
  return (
    <Panel title="What this costs you" description={`$${(rewardValueCents / 100).toFixed(0)} off after $${spend.toLocaleString("en-CA")} spent.`}>
      <p className={high ? "text-[16px] font-semibold text-points-text" : "text-[16px] font-semibold text-fg"}>{line}</p>
      {/* Wave Q: a Base UI Meter (role meter, value text) instead of a hand-drawn width bar. The track spans twice the margin. */}
      <Meter value={share} max={100} aria-label={`${pct}% back against a typical grocer net margin of ${GROCER_NET_MARGIN_PCT}%`} className="mt-3">
        <MeterTrack className="h-2 rounded-full bg-bg-muted">
          <MeterIndicator className={high ? "rounded-full bg-points" : "rounded-full bg-positive"} />
        </MeterTrack>
      </Meter>
      <p className="mt-2 text-meta text-fg-muted">
        {pct}% back, against a typical net margin of about {GROCER_NET_MARGIN_PCT}% for a small grocer (an estimate from Canadian small-business data). That is about {Math.round((pct / GROCER_NET_MARGIN_PCT) * 100)}% of the profit on the dollars members spend. Fixed-dollar rewards keep the cost predictable.
      </p>
    </Panel>
  );
}
