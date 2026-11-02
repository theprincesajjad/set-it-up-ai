"use client";
/**
 * Plans and payments (wave P): what shops pay and what needs a call about money. MRR and its make-up by plan and add-on, paying
 * shops and trials (each row opens the business), failed payments and trials ending before the shop is set up, and which plans
 * can be bought today (from Rollout). Built from the cockpit endpoints the overview already uses; nothing new is stored.
 */
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { adminCockpitApi } from "@ll/shared";
import { Dot, PageHeader, Panel, QuietLink, Row, RowList, Segmented, StatBlock, StatusPill } from "@/components/dashboard/kit";
import { HBarList } from "@/components/dashboard/Charts";
import { FLAG_LABEL, planLabel, pct } from "@/components/dashboard/admin/cockpit";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { verticalLabel } from "@/components/ui/VerticalIcon";
import { browserApi } from "@/lib/api/browser";
import { useApi } from "@/lib/dashboard/useApi";
import { relativeTime } from "@/lib/dashboard/time";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";

type Row = adminCockpitApi.BusinessRow;
const PLAN_ORDER = ["plus", "studio", "pro", "restaurant"] as const;

export default function PlansAndPaymentsPage() {
  const router = useRouter();
  const cockpit = useApi(() => browserApi.admin.cockpit.overview(30), []);
  const overview = useApi(() => browserApi.admin.overview(), []);
  const paying = useApi(() => browserApi.admin.cockpit.businesses({ status: "paying", sort: "mrrCents", dir: "desc", limit: 500 }), []);
  const trials = useApi(() => browserApi.admin.cockpit.businesses({ status: "trial", sort: "signedUpAt", dir: "desc", limit: 200 }), []);
  const health = useApi(() => browserApi.admin.cockpit.health(), []);
  const plans = useApi(() => browserApi.admin.plans(), []);
  const [tab, setTab] = useState<"paying" | "trial">("paying");

  const c = cockpit.data;
  const byPlan = useMemo(() => {
    const m = new Map<string, { n: number; cents: number }>();
    for (const r of paying.data?.items ?? []) {
      const k = r.plan;
      const x = m.get(k) ?? { n: 0, cents: 0 };
      m.set(k, { n: x.n + 1, cents: x.cents + r.mrrCents });
    }
    return [...PLAN_ORDER, ...[...m.keys()].filter((k) => !(PLAN_ORDER as readonly string[]).includes(k))].filter((k) => m.has(k)).map((k) => ({ key: k, ...m.get(k)! }));
  }, [paying.data]);
  const attention = (health.data?.atRisk ?? []).filter((r) => r.flags.includes("payment_failed") || r.flags.includes("trial_ending_not_activated"));
  const failed = health.data?.counts.payment_failed ?? 0;

  const cols: Column<Row>[] = [
    {
      key: "name",
      header: "Business",
      mobile: "title",
      cell: (r) => (
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium">{r.name}</span>
          <span className="truncate text-caption text-fg-muted max-md:hidden">{[verticalLabel(r.trade), r.city].filter(Boolean).join(" · ")}</span>
        </span>
      ),
    },
    { key: "plan", header: "Plan", mobile: "subtitle", cell: (r) => (r.flags.includes("payment_failed") ? <span className="flex items-center gap-2">{planLabel(r.plan)} <StatusPill tone="negative">Payment failed</StatusPill></span> : planLabel(r.plan)) },
    { key: "mrr", header: "MRR", align: "end", mobile: "trailing", cell: (r) => (r.mrrCents ? formatMoney(r.mrrCents) : "–") },
    { key: "gmv", header: "Processed, 30 d", align: "end", mobile: "hidden", cell: (r) => formatMoney(r.gmv30dCents) },
    { key: "signed", header: "Signed up", mobile: "hidden", cell: (r) => formatDate(r.signedUpAt) },
    { key: "active", header: "Last active", mobile: "hidden", cell: (r) => (r.lastActiveAt ? relativeTime(r.lastActiveAt) : "Never") },
  ];
  const list = tab === "paying" ? paying : trials;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader flush title="Plans and payments" description="What shops pay, who is in a trial, and whose payment needs a call." actions={<QuietLink href="/admin/rollout">Plan features</QuietLink>} />
      <StatBlock
        loading={!c}
        label="Money"
        items={[
          { label: "MRR", value: c ? formatMoney(c.money.mrrCents) : "–", caption: c ? `ARR $${formatNumber(Math.round(c.money.arrCents / 100))}` : undefined },
          { label: "Paying shops", value: c ? formatNumber(c.shops.paying) : "–", caption: c ? `${formatNumber(c.shops.total)} shops open` : undefined },
          { label: "In trial", value: c ? formatNumber(c.shops.trialing) : "–", caption: c ? `${pct(c.money.trialToPaid.rate)} of ended trials paid` : undefined },
          { label: "Payment failed", value: formatNumber(failed), caption: failed ? "Call them today" : "None", dot: failed ? "negative" : undefined },
        ]}
      />

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Panel title="Needs a call" description="Failed payments first, then trials ending before the first stamp or booking">
          {health.data ? (
            attention.length ? (
              <RowList label="Payments that need a call">
                {attention.map((r) => {
                  const i = r.flags.includes("payment_failed") ? r.flags.indexOf("payment_failed") : r.flags.indexOf("trial_ending_not_activated");
                  return (
                    <Row
                      key={r.merchantId}
                      href={`/admin/businesses/${r.merchantId}`}
                      leading={<span aria-hidden className={`size-2 rounded-full ${r.flags[i] === "payment_failed" ? "bg-negative" : "bg-points"}`} />}
                      title={r.name}
                      meta={`${FLAG_LABEL[r.flags[i]!]}. ${r.reasons[i] ?? ""}`}
                      trailing={r.mrrCents ? <span className="text-meta text-fg-muted">{formatMoney(r.mrrCents)}/mo</span> : null}
                    />
                  );
                })}
              </RowList>
            ) : (
              <p className="text-meta text-fg-muted">No failed payments and no trial about to lapse.</p>
            )
          ) : (
            <div className="h-32 skeleton rounded-sm" aria-hidden />
          )}
        </Panel>
        <Panel title="MRR by plan" description={paying.data ? `${formatNumber(paying.data.total)} paying shops` : "Loading…"}>
          {byPlan.length ? (
            <HBarList format={(n) => formatMoney(n)} rows={byPlan.map((p) => ({ key: p.key, label: planLabel(p.key), value: p.cents, hint: `${p.n} ${p.n === 1 ? "shop" : "shops"}` }))} />
          ) : (
            <p className="text-meta text-fg-muted">{paying.data ? "No shop pays yet." : ""}</p>
          )}
        </Panel>
      </div>

      {overview.data ? (
        <Panel title="What MRR is made of" description={`Plans, restaurant tiers and add-ons on paying shops. Platform fees, last 30 days: ${formatMoney(overview.data.money.feeRevenue30dCents)} on ${formatMoney(overview.data.money.volume30dCents)} paid through the app.`}>
          <dl data-testid="mrr-split" className="grid grid-cols-2 gap-x-6 gap-y-3 text-meta sm:grid-cols-5">
            {(
              [
                ["Pro and Service", overview.data.money.mrrSplit.plansCents],
                ["Restaurant tiers", overview.data.money.mrrSplit.restaurantCents],
                ["WhatsApp packs", overview.data.money.mrrSplit.whatsappCents],
                ["Extra locations", overview.data.money.mrrSplit.extraLocationsCents],
                ["Other add-ons", overview.data.money.mrrSplit.otherAddOnsCents],
              ] as const
            ).map(([label, cents]) => (
              <div key={label}>
                <dt className="text-label text-fg-muted">{label}</dt>
                <dd className="text-body tabular text-fg">{formatMoney(cents)}</dd>
              </div>
            ))}
          </dl>
        </Panel>
      ) : null}

      <DataTable
        caption={tab === "paying" ? "Paying shops" : "Shops in trial"}
        columns={cols}
        rows={list.data?.items ?? []}
        rowKey={(r) => r.id}
        loading={list.loading && !list.data}
        error={list.error}
        onRetry={list.reload}
        onRowClick={(r) => router.push(`/admin/businesses/${r.id}`)}
        empty={tab === "paying" ? "No shop pays yet." : "No shop is in a trial."}
        toolbar={
          <Segmented
            label="Show"
            value={tab}
            onChange={setTab}
            options={[
              { value: "paying", label: `Paying${paying.data ? ` · ${paying.data.total}` : ""}` },
              { value: "trial", label: `In trial${trials.data ? ` · ${trials.data.total}` : ""}` },
            ]}
          />
        }
      />

      <Panel title="Plans on sale" description="A plan can be bought once at least one of its features is out of Hidden." action={<QuietLink href="/admin/rollout">Rollout</QuietLink>}>
        <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
          {(plans.data?.items ?? []).map((p) => (
            <div key={p.id} className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-body font-medium text-fg">{planLabel(p.id)}</span>
                <Dot tone={p.available ? "positive" : "neutral"}>{p.available ? "On sale" : "Not yet"}</Dot>
              </div>
              <span className="text-meta text-fg-muted">{p.id === "free" ? "Always available" : `${p.priceCents ? `${formatMoney(p.priceCents)} a month · ` : ""}${p.features.filter((x) => x.stage !== "hidden").length} of ${p.features.length} features out`}</span>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
