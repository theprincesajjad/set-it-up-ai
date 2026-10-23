import { copy } from "@/copy/en-CA";
import { publicServerApi } from "@/lib/api/server";
import { formatNumber } from "@/lib/format";

/** The network has to pass this many shops before the counts are shown: tiny numbers prove nothing. */
export const LIVE_PROOF_MIN_SHOPS = 10;

/** What the strip prints for a set of network stats; null when it should not render at all. */
export function liveProofStats(n: { activeMerchants: number; liveStreets: number; multiShopMemberPct: number } | null | undefined) {
  if (!n || n.activeMerchants < LIVE_PROOF_MIN_SHOPS) return null;
  return [
    { value: formatNumber(n.activeMerchants), label: copy.landing.proof.shops },
    { value: formatNumber(n.liveStreets), label: copy.landing.proof.streets },
    { value: `${Number.isInteger(n.multiShopMemberPct) ? n.multiShopMemberPct : n.multiShopMemberPct.toFixed(1)}%`, label: copy.landing.proof.multi },
  ];
}

/**
 * Live counts from GET /v1/public/plans, shown under the router. Real numbers only: it renders nothing while the
 * network has fewer than 10 shops, and nothing when the API is unreachable.
 */
export async function LiveProof() {
  let stats: ReturnType<typeof liveProofStats> = null;
  try {
    stats = liveProofStats((await publicServerApi().public.plans()).network);
  } catch {
    stats = null;
  }
  if (!stats) return null;
  return (
    <section aria-label="The network today" className="bg-bg-subtle py-10 md:py-14">
      <div className="mx-auto max-w-[1200px] px-4 md:px-8">
        <dl className="grid gap-8 md:grid-cols-3">
          {stats.map((s) => (
            <div key={s.label}>
              <dd className="display text-mkt-md tabular-nums md:text-mkt-lg">{s.value}</dd>
              <dt className="mt-1 text-body text-fg-muted">{s.label}</dt>
            </div>
          ))}
        </dl>
        <p className="mt-8 text-caption text-fg-muted">{copy.landing.proof.note}</p>
      </div>
    </section>
  );
}
