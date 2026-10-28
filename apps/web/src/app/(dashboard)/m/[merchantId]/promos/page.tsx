"use client";
import Link from "next/link";
import { useState } from "react";
import { Plus } from "lucide-react";
import type { merchantApi, reportsApi } from "@ll/shared";
import { FeatureGate } from "@/components/dashboard/FeatureGate";
import { Empty, EmptyState, ErrorLine, PageHeader, SkeletonRows, StatusDot, Table, TableWrap, Td, Th, Tr } from "@/components/dashboard/kit";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/format";
import { promoStatusLine, promoWhen, signedVisits, templatesFor } from "@/lib/dashboard/promos";
import { useRouter } from "next/navigation";
import { useApi } from "@/lib/dashboard/useApi";

const TABS: { id: merchantApi.PromoStatus; label: string }[] = [
  { id: "live", label: "Running" },
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
  const { api, base, enabled, detail } = useMerchant();
  const term = detail.program?.terminology ?? "points";
  const router = useRouter();
  const [tab, setTab] = useState<merchantApi.PromoStatus>("live");
  const all = useApi(() => api.promos(), [api]);
  // Results (visits in window against the same weekday and hours over the last 4 weeks) come with promos.basic.
  const results = useApi(enabled("promos.basic") ? () => api.reports.promos() : null, [api]);
  const byId = new Map<string, reportsApi.PromoResult>((results.data?.items ?? []).map((r) => [r.promoId, r]));
  const items = (all.data?.items ?? []).filter((p) => p.status === tab);
  const count = (s: merchantApi.PromoStatus) => (all.data?.items ?? []).filter((p) => p.status === s).length;
  const templates = templatesFor(enabled("loyalty.referrals"), term);
  const showResults = enabled("promos.basic");
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        flush
        title="Promos"
        description="Start from a template. Each promo reports extra visits against the same weekday and hours in the last four weeks."
        actions={<Button size="md" iconStart={Plus} href={`${base}/promos/new`} className="h-[38px] rounded-full px-4 text-[14px] font-medium">Create a promo</Button>}
      />

      <section aria-labelledby="tpl-h" className="flex flex-col gap-4">
        <h2 id="tpl-h" className="pb-1 text-headline text-fg">Start from a template</h2>
        <ul className="grid gap-4 pt-1 sm:grid-cols-2 xl:grid-cols-4">
          {templates.map((t, i) => (
            <li key={t.key} className={`flex flex-col gap-2 rounded-tile p-5 ${["bg-tile-peach","bg-tile-mint","bg-tile-butter","bg-tile-lilac"][i % 4]}`}>
              <p className="text-[16px] font-semibold text-fg">{t.title}</p>
              <p className="text-[14px] leading-5 text-fg-muted">{t.blurb}</p>
              <span className="self-start rounded-full bg-card/70 px-2.5 py-0.5 text-[12px] text-fg">{t.job}</span>
              <Link href={`${base}/promos/new?template=${t.key}`} className="mt-1 text-[14px] font-semibold text-fg underline-offset-2 hover:underline focus-visible:focus-ring">
                Use this
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <div role="tablist" aria-label="Promo status" className="flex gap-5 border-b border-line">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn("-mb-px border-b-2 px-0.5 pb-2.5 pt-1 text-[14px] transition-colors focus-visible:focus-ring", tab === t.id ? "border-fg font-medium text-fg" : "border-transparent text-fg-muted hover:text-fg")}
          >
            {t.label} {all.data ? <span className="tabular">{count(t.id)}</span> : null}
          </button>
        ))}
      </div>

      {all.error && !all.data ? (
        <ErrorLine message={all.error} onRetry={all.reload} />
      ) : all.loading && !all.data ? (
        <SkeletonRows rows={4} />
      ) : items.length ? (
        <TableWrap>
          <Table label="Promos">
            <thead>
              <tr>
                <Th>Promo</Th>
                <Th>When</Th>
                {showResults ? (
                  <>
                    <Th>Visits in window</Th>
                    <Th>Typical</Th>
                    <Th>Extra visits</Th>
                    <Th>Free items given</Th>
                  </>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {items.map((p) => {
                const r = byId.get(p.id);
                return (
                  <Tr key={p.id} onOpen={() => router.push(`${base}/promos/${p.id}`)} aria-label={p.title}>
                    <Td className="min-w-[220px]">
                      <span className="block font-semibold text-fg">{p.title}</span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-[12px] font-normal text-fg-muted">
                        {p.status === "live" ? <StatusDot domain="promo" status="live" label={promoStatusLine(p)} /> : promoStatusLine(p)}
                      </span>
                    </Td>
                    <Td className="text-fg">{promoWhen(p)}</Td>
                    {showResults ? (
                      <>
                        <Td className="font-semibold tabular text-fg">{r ? formatNumber(r.windowVisits) : "–"}</Td>
                        <Td className="tabular text-fg-muted">{r ? (r.typicalVisits == null ? <span className="text-[12px]">Not enough history</span> : formatNumber(r.typicalVisits)) : "–"}</Td>
                        <Td className={cn("tabular", r && r.extraVisits != null && r.extraVisits > 0 ? "font-medium text-positive-text" : "text-fg-muted")}>{r ? (r.extraVisits == null ? "–" : signedVisits(r.extraVisits)) : "–"}</Td>
                        <Td className="tabular text-fg">{r ? formatNumber(r.freeItemsGiven) : "–"}</Td>
                      </>
                    ) : null}
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        </TableWrap>
      ) : (all.data?.items.length ?? 0) === 0 ? (
        <EmptyState title="No promos yet" description={`A simple offer gets people through the door. Try double ${term} on a slow afternoon.`} action={<Button variant="secondary" size="sm" href={`${base}/promos/new?template=slow_afternoons`}>Use the slow afternoons template</Button>} />
      ) : (
        <Empty className="border-y border-line">Nothing {TABS.find((t) => t.id === tab)?.label.toLowerCase()} right now.</Empty>
      )}
    </div>
  );
}
