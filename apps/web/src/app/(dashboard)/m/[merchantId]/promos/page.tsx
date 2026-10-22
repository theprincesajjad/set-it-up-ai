"use client";
import { EmptyState, PageHeader, StatusDot, Tabs } from "@/components/dashboard/kit";
import { FeatureGate } from "@/components/dashboard/FeatureGate";
import { Megaphone, Plus } from "lucide-react";
import { useState } from "react";
import type { merchantApi } from "@ll/shared";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Button } from "@/components/ui/Button";
import { PromoCard } from "@/components/ui/PromoCard";
import { Skeleton } from "@/components/ui/Skeleton";
import { formatDate, formatNumber } from "@/lib/format";
import { useApi } from "@/lib/dashboard/useApi";

const TABS: { id: merchantApi.PromoStatus; label: string }[] = [
  { id: "live", label: "Live" },
  { id: "scheduled", label: "Scheduled" },
  { id: "draft", label: "Drafts" },
  { id: "ended", label: "Ended" },
];

/** Pricing v2: a paid (Plus) section. Deep links show the "Coming soon" card when it's locked. */
export default function PromosPageGated() {
  return (
    <FeatureGate keys={["promos.basic", "promos.double_points"]} title="Promos">
      <PromosPage />
    </FeatureGate>
  );
}

function PromosPage() {
  const { api, base, detail } = useMerchant();
  const [tab, setTab] = useState<merchantApi.PromoStatus>("live");
  const all = useApi(() => api.promos(), [api]);
  const items = (all.data?.items ?? []).filter((p) => p.status === tab);
  const count = (s: merchantApi.PromoStatus) => (all.data?.items ?? []).filter((p) => p.status === s).length;
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Promos" description="Offers on your shop page and the neighbourhood feed." actions={<Button size="sm" iconStart={Plus} href={`${base}/promos/new`}>Create a promo</Button>} />
      <Tabs label="Promo status" value={tab} onChange={(v) => setTab(v as merchantApi.PromoStatus)} items={TABS.map((t) => ({ id: t.id, label: t.label, meta: all.data ? <span className="text-caption tabular-nums text-fg-muted">{count(t.id)}</span> : null }))} />
      {all.loading && !all.data ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-40 rounded-card" />
          <Skeleton className="h-40 rounded-card" />
        </div>
      ) : items.length ? (
        <ul className="grid gap-4 md:grid-cols-2">
          {items.map((p) => (
            <li key={p.id} className="flex flex-col gap-2">
              <PromoCard promo={p} shop={detail.merchant} variant="preview" href={`${base}/promos/${p.id}`} />
              <p className="flex flex-wrap items-center gap-2 px-1 text-meta text-fg-muted">
                <StatusDot domain="promo" status={p.status} />
                {formatDate(p.startsAt)}
                {p.endsAt ? ` to ${formatDate(p.endsAt)}` : ""}
                {p.status !== "draft" ? ` · ${formatNumber(p.viewCount)} views · ${formatNumber(p.claimCount)} redemptions` : ""}
              </p>
            </li>
          ))}
        </ul>
      ) : (all.data?.items.length ?? 0) === 0 ? (
        <EmptyState icon={Megaphone} title="No promos yet" description="A simple offer gets people through the door. Try double stamps on a slow afternoon." action={<Button variant="secondary" size="sm" href={`${base}/promos/new`}>Create a promo</Button>} />
      ) : (
        <p className="py-8 text-center text-body text-fg-muted">Nothing {TABS.find((t) => t.id === tab)?.label.toLowerCase()} right now.</p>
      )}
    </div>
  );
}
