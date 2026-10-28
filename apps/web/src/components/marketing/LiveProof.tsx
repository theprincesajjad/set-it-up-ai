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
 * network has fewer than 10 shops, and nothing when the API is unreachable. The page is statically rendered and
 * re-generated every 5 minutes (`revalidate` on the page and on the API call), so the counts can trail by that long; the
 * data-* attributes carry the values this render was made from.
 */
export async function LiveProof() {
  let network: Awaited<ReturnType<ReturnType<typeof publicServerApi>["public"]["plans"]>>["network"] | null = null;
  try {
    network = (await publicServerApi().public.plans()).network;
  } catch {
    network = null;
  }
  const stats = liveProofStats(network);
  if (!stats || !network) return null;
  return (
    <section
      aria-label="The network today"
      className="py-10 md:py-14"
      data-shops={network.activeMerchants}
      data-streets={network.liveStreets}
      data-multi-pct={network.multiShopMemberPct}
    >
      <div className="mx-auto max-w-[1200px] px-4 md:px-8">
        <dl className="grid gap-4 md:grid-cols-3">
          {stats.map((s, i) => (
            <div key={s.label} className={["bg-tile-mint text-tile-mint-foreground", "bg-tile-butter text-tile-butter-foreground", "bg-tile-lilac text-tile-lilac-foreground"][i % 3] + " rounded-tile p-6"}>
              <dd className="display text-mkt-md tabular-nums md:text-mkt-lg">{s.value}</dd>
              <dt className="mt-1 text-body-strong">{s.label}</dt>
            </div>
          ))}
        </dl>
        <p className="mt-8 text-caption text-muted-foreground">{copy.landing.proof.note}</p>
      </div>
    </section>
  );
}
