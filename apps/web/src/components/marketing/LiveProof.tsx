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
 * Live counts from GET /v1/public/plans, right under the home hero. Real numbers only: it renders nothing while the network has fewer
 * than 10 shops, and nothing when the API is unreachable. The page is statically rendered and re-generated every 5 minutes (`revalidate`
 * on the page and on the API call), so the counts can trail by that long; the data-* attributes carry the values this render was made from.
 * Wave T: three big numbers between hairlines under the hero; the styles are the home page's (landing.css).
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
    <section aria-label="Live counts" data-shops={network.activeMerchants} data-streets={network.liveStreets} data-multi-pct={network.multiShopMemberPct}>
      <dl className="lp-counts">
        {stats.map((s) => (
          <div key={s.label}>
            <dt>{s.label}</dt>
            <dd>{s.value}</dd>
          </div>
        ))}
      </dl>
      <p className="lp-meta lp-counts-note">{copy.landing.proof.note}</p>
    </section>
  );
}
