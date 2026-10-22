"use client";
import { EmptyState, PageHeader, StatusDot } from "@/components/dashboard/kit";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import type { adsApi } from "@ll/shared";
import { FeatureGate } from "@/components/dashboard/FeatureGate";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Button } from "@/components/ui/Button";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { useApi } from "@/lib/dashboard/useApi";
import { PLACEMENT_LABEL } from "@/lib/dashboard/ads";


export default function AdsPage() {
  return (
    <FeatureGate keys={["ads.sponsored_listing", "ads.sponsored_promo", "ads.map_pin"]} title="Sponsored placements">
      <Ads />
    </FeatureGate>
  );
}

function Ads() {
  const { api, base } = useMerchant();
  const router = useRouter();
  const list = useApi(() => api.ads(), [api]);
  const cols: Column<adsApi.AdCampaign>[] = [
    { key: "headline", header: "Ad", mobile: "title", cell: (a) => <span className="font-medium">{a.headline}</span> },
    { key: "placement", header: "Placement", mobile: "subtitle", cell: (a) => PLACEMENT_LABEL[a.placement] },
    { key: "status", header: "Status", mobile: "trailing", cell: (a) => <StatusDot domain="ad" status={a.status === "active" ? "live" : a.status} /> },
    { key: "dates", header: "Dates", mobile: "subtitle", cell: (a) => `${formatDate(a.startsAt)} to ${formatDate(a.endsAt)}` },
    { key: "budget", header: "Budget", align: "end", mobile: "hidden", cell: (a) => `${formatMoney(a.spentCents)} of ${formatMoney(a.budgetCents)}` },
    { key: "visits", header: "Visits", align: "end", mobile: "hidden", cell: (a) => formatNumber(a.attributedVisits) },
    { key: "pay", header: "Payment", mobile: "hidden", cell: (a) => <StatusDot domain="invoice" status={a.paymentStatus === "paid" ? "paid" : "open"} label={a.paymentStatus === "paid" ? "Paid" : a.paymentStatus.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())} /> },
  ];
  return (
    <div className="flex flex-col gap-6">
      <PageHeader flush title="Ads" description="Reach people near your street. Every ad is labelled Sponsored and reviewed before it runs." actions={<Button size="sm" iconStart={Plus} href={`${base}/ads/new`}>New ad</Button>} />
      <DataTable caption="Ad campaigns" columns={cols} rows={list.data?.items ?? []} rowKey={(a) => a.id} loading={list.loading} error={list.error} onRetry={list.reload} onRowClick={(a) => router.push(`${base}/ads/${a.id}`)} empty={<EmptyState title="No ads yet" description="Boost a live promo or put your shop at the top of the neighbourhood feed." action={<Button variant="secondary" size="sm" href={`${base}/ads/new`}>New ad</Button>} />} />
    </div>
  );
}
