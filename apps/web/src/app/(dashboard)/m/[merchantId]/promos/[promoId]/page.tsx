"use client";
import { BackLink, PageHeader, StatGrid, StatTile, StatusDot } from "@/components/dashboard/kit";
import { FeatureGate } from "@/components/dashboard/FeatureGate";
import { useParams } from "next/navigation";
import { merchantApi } from "@ll/shared";
import { ConfirmDialog } from "@/components/dashboard/ConfirmDialog";
import { PromoEditor } from "@/components/dashboard/PromoEditor";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Async } from "@/components/dashboard/PageStates";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { errorMessage } from "@/lib/api/errors";
import { formatNumber } from "@/lib/format";
import { STATUS_ACTION, draftFromPromo } from "@/lib/dashboard/promos";
import { useApi } from "@/lib/dashboard/useApi";
import { useState } from "react";

/** Pricing v2: a paid (Plus) section. Deep links show the "Coming soon" card when it's locked. */
export default function PromoPageGated() {
  return (
    <FeatureGate keys={["promos.basic", "promos.double_points"]} title="Promos">
      <PromoPage />
    </FeatureGate>
  );
}

function PromoPage() {
  const { promoId } = useParams<{ promoId: string }>();
  const { api, base } = useMerchant();
  const toast = useToast();
  const promo = useApi(() => api.promo(promoId), [api, promoId]);
  const results = useApi(() => api.reports.promos(), [api]);
  const [confirm, setConfirm] = useState<merchantApi.PromoStatus | null>(null);
  return (
    <div className="flex flex-col gap-4">
      <BackLink href={`${base}/promos`}>Promos</BackLink>
      <Async state={promo}>
        {(p) => {
          const r = results.data?.items.find((x) => x.promoId === p.id);
          const next = merchantApi.PROMO_TRANSITIONS[p.status].filter((s) => s !== "scheduled" || new Date(p.startsAt).getTime() > Date.now());
          return (
            <>
              <PageHeader
                title={p.title}
                description={<StatusDot domain="promo" status={p.status} />}
                actions={next.map((s) => (
                  <Button size="sm" key={s} variant={s === "live" ? "primary" : "secondary"} onClick={() => setConfirm(s)}>
                    {STATUS_ACTION[s] ?? s}
                  </Button>
                ))}
              />
              {p.status !== "draft" ? (
                <StatGrid>
                  <StatTile label="Views" value={formatNumber(p.viewCount)} />
                  <StatTile label="Redemptions" value={formatNumber(p.claimCount)} />
                  <StatTile label="Visits during promo" value={r ? formatNumber(r.attributedVisits) : null} loading={results.loading} />
                  <StatTile label="Lift vs before" value={r?.liftPct != null ? `${r.liftPct > 0 ? "+" : ""}${Math.round(r.liftPct)}%` : "–"} caption={r?.liftPct == null ? "Needs 14 days of history" : "Avg daily visits vs the 14 days before"} loading={results.loading} />
                </StatGrid>
              ) : null}
              <PromoEditor key={p.id + p.status} initial={draftFromPromo(p)} promo={p} />
              <ConfirmDialog
                open={!!confirm}
                onClose={() => setConfirm(null)}
                title={confirm === "live" ? "Publish this promo now?" : confirm === "ended" ? "End this promo now?" : confirm === "archived" ? "Archive this promo?" : `${STATUS_ACTION[confirm!] ?? "Change"}?`}
                body={confirm === "live" ? "It shows on your shop page and the neighbourhood feed right away." : confirm === "ended" ? "Customers stop seeing it immediately." : undefined}
                confirmLabel={STATUS_ACTION[confirm!] ?? "Confirm"}
                danger={confirm === "ended"}
                onConfirm={async () => {
                  try {
                    const n = await api.setPromoStatus(p.id, confirm!);
                    promo.setData(n);
                    toast({ message: n.status === "live" ? "Your promo is live." : "Updated", tone: "success" });
                  } catch (e) {
                    throw new Error(errorMessage(e));
                  }
                }}
              />
            </>
          );
        }}
      </Async>
    </div>
  );
}
