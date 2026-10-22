"use client";
import { BackLink, PageHeader, Panel, StatTile } from "@/components/dashboard/kit";
import { useParams } from "next/navigation";
import { useState } from "react";
import { BarChart } from "@/components/dashboard/Charts";
import { FeatureGate } from "@/components/dashboard/FeatureGate";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Async } from "@/components/dashboard/PageStates";
import { PaymentBox, pollUntil } from "@/components/pass/PaymentBox";
import { Badge } from "@/components/ui/Badge";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { useAction, useApi } from "@/lib/dashboard/useApi";
import { AD_STATUS_TONE, PLACEMENT_LABEL } from "@/lib/dashboard/ads";

export default function AdPage() {
  const { adId } = useParams<{ adId: string }>();
  const { api, base, role } = useMerchant();
  const ad = useApi(() => api.ad(adId), [api, adId]);
  const report = useApi(() => api.adReport(adId), [api, adId]);
  const [pay, setPay] = useState<{ paymentIntentId: string; clientSecret: string; amountCents: number } | null>(null);
  const act = useAction();
  return (
    <FeatureGate keys={["ads.sponsored_listing", "ads.sponsored_promo", "ads.map_pin"]}>
      <div className="flex flex-col gap-4">
        <BackLink href={`${base}/ads`}>Ads</BackLink>
        <Async state={ad}>
          {(a) => (
            <>
              <PageHeader title={a.headline} description={<span className="flex flex-wrap items-center gap-2"><Badge tone={AD_STATUS_TONE[a.status]} dot>{a.status.replace("_", " ")}</Badge>{PLACEMENT_LABEL[a.placement]} · {formatDate(a.startsAt)} to {formatDate(a.endsAt)}</span>} actions={
                <>
                  {a.status === "active" ? <Button size="sm" variant="secondary" onClick={async () => { const r = await act.run(() => api.adAction(a.id, "pause")); if (r) ad.setData(r); }}>Pause</Button> : null}
                  {a.status === "paused" ? <Button size="sm" variant="secondary" onClick={async () => { const r = await act.run(() => api.adAction(a.id, "resume")); if (r) ad.setData(r); }}>Resume</Button> : null}
                  {["pending_review", "active", "paused"].includes(a.status) ? <Button size="sm" variant="ghost" onClick={async () => { const r = await act.run(() => api.adAction(a.id, "cancel")); if (r) ad.setData(r); }}>Cancel ad</Button> : null}
                </>
              } />
              {a.reviewNote ? <Banner tone={a.status === "rejected" ? "danger" : "info"}>Review note: {a.reviewNote}</Banner> : null}
              {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
              {a.paymentStatus === "pending" && role === "owner" && !["rejected", "ended"].includes(a.status) ? (
                <Panel title={`Pay ${formatMoney(a.budgetCents)}`} description="Charged to your card on our Stripe account. Refunded automatically if the ad is rejected.">
                  {pay ? (
                    <PaymentBox paymentIntentId={pay.paymentIntentId} clientSecret={pay.clientSecret} amountCents={pay.amountCents} label={`Pay ${formatMoney(pay.amountCents)}`} onPaid={async () => {
                      await pollUntil(async () => {
                        const n = await api.ad(a.id);
                        ad.setData(n);
                        return n.paymentStatus === "paid";
                      });
                      setPay(null);
                    }} />
                  ) : (
                    <Button size="sm" loading={act.busy} onClick={async () => { const r = await act.run(() => api.payAd(a.id)); if (r) setPay(r); }}>Pay by card</Button>
                  )}
                </Panel>
              ) : (
                <Badge tone={a.paymentStatus === "paid" ? "success" : "neutral"}>Payment: {a.paymentStatus}</Badge>
              )}
              <div className="grid grid-cols-2 gap-px overflow-hidden rounded-card border border-line bg-line lg:grid-cols-4">
                <StatTile label="Views" value={report.data ? formatNumber(report.data.impressions) : null} loading={report.loading} />
                <StatTile label="Taps" value={report.data ? formatNumber(report.data.clicks) : null} loading={report.loading} caption={report.data ? `${(report.data.ctr * 100).toFixed(1)}% of views` : undefined} />
                <StatTile label="Visits" value={report.data ? formatNumber(report.data.attributedVisits) : null} loading={report.loading} caption="Within 7 days of seeing it" />
                <StatTile label="Cost per visit" value={report.data?.costPerVisitCents != null ? formatMoney(report.data.costPerVisitCents) : "–"} loading={report.loading} />
              </div>
              {report.data ? <BarChart title="Daily views" valueLabel="Views" data={report.data.daily.map((x) => ({ label: x.date.slice(5), value: x.impressions }))} /> : null}
            </>
          )}
        </Async>
      </div>
    </FeatureGate>
  );
}
