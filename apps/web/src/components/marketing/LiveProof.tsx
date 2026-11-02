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
      aria-label="Live counts"
      className="py-6 md:py-14"
      data-shops={network.activeMerchants}
      data-streets={network.liveStreets}
      data-multi-pct={network.multiShopMemberPct}
    >
      <div className="mx-auto max-w-[1200px] px-4 md:px-8">
        {/* Wave Q: one card with three hairline-split columns (was three pastel tiles), a live dot beside the note. */}
        <dl className="card-clear grid grid-cols-3 divide-x divide-border overflow-hidden rtl:divide-x-reverse">
          {stats.map((s) => (
            <div key={s.label} className="flex flex-col-reverse justify-end gap-1 px-3 py-4 md:px-8 md:py-7">
              <dt className="text-meta text-muted-foreground md:text-body">{s.label}</dt>
              <dd className="text-[28px] leading-none font-[750] tracking-[-0.035em] tabular-nums text-foreground md:text-[52px]">{s.value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 flex items-center gap-2 text-caption text-muted-foreground md:mt-4">
          <span aria-hidden className="relative flex size-2">
            <span className="absolute inset-0 rounded-full bg-success opacity-60 motion-safe:animate-ping" />
            <span className="relative size-2 rounded-full bg-success" />
          </span>
          {copy.landing.proof.note}
        </p>
      </div>
    </section>
  );
}
