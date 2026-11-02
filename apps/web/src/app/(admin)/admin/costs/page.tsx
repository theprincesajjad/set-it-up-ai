"use client";
import { PageHeader, Panel, StatBlock } from "@/components/dashboard/kit";
import { useRouter } from "next/navigation";
import { planLabel } from "@/components/dashboard/admin/cockpit";
import type { adminApi } from "@ll/shared";
import { ListAsync } from "@/components/dashboard/ListStates";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { browserApi } from "@/lib/api/browser";
import { formatMoney, formatNumber } from "@/lib/format";
import { useApi } from "@/lib/dashboard/useApi";

const cents = (n: number) => (Math.abs(n) < 100 ? `${n < 0 ? "-" : ""}$${Math.abs(n / 100).toFixed(2)}` : formatMoney(n));

/** What each shop costs us (texts, WhatsApp, hosting) against what it pays (plan and platform fees). */
export default function CostsPage() {
  const router = useRouter();
  const c = useApi(() => browserApi.admin.costs(), []);
  const cols: Column<adminApi.ShopCostRow>[] = [
    { key: "name", header: "Shop", mobile: "title", sortValue: (r) => r.name, cell: (r) => <span className="font-medium">{r.name}</span> },
    { key: "plan", header: "Plan", mobile: "subtitle", cell: (r) => planLabel(r.plan) },
    { key: "sms", header: "Texts", align: "end", mobile: "hidden", sortValue: (r) => r.smsCredits, cell: (r) => formatNumber(r.smsCredits) },
    { key: "wa", header: "WhatsApp", align: "end", mobile: "hidden", sortValue: (r) => r.whatsappMessages, cell: (r) => formatNumber(r.whatsappMessages) },
    { key: "cost", header: "Cost", align: "end", mobile: "trailing", sortValue: (r) => r.costCents, cell: (r) => cents(r.costCents) },
    { key: "rev", header: "Plan + fees", align: "end", mobile: "hidden", sortValue: (r) => r.subscriptionCents + r.feeCents30d, cell: (r) => cents(r.subscriptionCents + r.feeCents30d) },
    { key: "margin", header: "Margin", align: "end", mobile: "hidden", sortValue: (r) => r.marginCents, cell: (r) => <span className={r.marginCents < 0 ? "text-negative" : undefined}>{cents(r.marginCents)}</span> },
  ];
  return (
    <div className="flex flex-col gap-6">
      <PageHeader flush title="Costs" description="What each shop costs us this month (texts, WhatsApp, hosting) against what it pays (plan and 30 days of fees)." />
      <ListAsync state={c} errorTitle="Couldn't load the costs.">
        {(d) => (
          <>
            <StatBlock
              label="Totals"
              items={[
                { label: "Margin", value: formatMoney(d.totals.marginCents), caption: `${formatMoney(d.totals.subscriptionCents)} plans + ${formatMoney(d.totals.feeCents30d)} fees − cost`, dot: d.totals.marginCents < 0 ? "negative" : undefined },
                { label: "Cost this month", value: formatMoney(d.totals.costCents), caption: `${formatNumber(d.totals.shops)} shops · ${formatMoney(d.totals.shops ? Math.round(d.totals.costCents / d.totals.shops) : 0)} each` },
                { label: "Texts sent", value: formatNumber(d.totals.smsCredits), caption: `at ${d.assumptions.smsSegmentCents}¢ each (estimate)` },
                { label: "WhatsApp sent", value: formatNumber(d.totals.whatsappMessages), caption: `at ${d.assumptions.whatsappMessageCents}¢ each (estimate)` },
              ]}
            />
            <Panel padded={false} title="By shop" description={`Most expensive first. ${formatNumber(d.shops.filter((r) => r.marginCents < 0).length)} shops cost more than they pay (Free shops, by design). Hosting is a flat estimate per shop.`}>
              <DataTable caption="Cost per shop" columns={cols} rows={d.shops} rowKey={(r) => r.merchantId} onRowClick={(r) => router.push(`/admin/businesses/${r.merchantId}`)} empty={<p className="px-4 py-6 text-meta text-fg-muted">No shops yet.</p>} />
            </Panel>
            <p className="text-meta text-fg-muted">Costs per text, message and shop are our own estimates from the finance model: texts {d.assumptions.smsSegmentCents}¢, WhatsApp {d.assumptions.whatsappMessageCents}¢, hosting {formatMoney(d.assumptions.infraPerShopCents)} per shop. Card processing is paid by the shop and is not counted here.</p>
          </>
        )}
      </ListAsync>
    </div>
  );
}
