"use client";
/**
 * Health and churn risk (wave N): shops with a payment failure, a trial ending before the first stamp or booking, usage down more
 * than 40% week over week, or 14 days without a stamp, booking or staff login; most urgent first, each with its reason and its
 * 8-week usage trend (stamps + bookings + logins).
 */
import { useRouter } from "next/navigation";
import { PageHeader, StatBlock } from "@/components/dashboard/kit";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { BusinessStatus, FLAG_LABEL, Sparkline } from "@/components/dashboard/admin/cockpit";
import { verticalLabel } from "@/components/ui/VerticalIcon";
import type { adminCockpitApi } from "@ll/shared";
import { browserApi } from "@/lib/api/browser";
import { useApi } from "@/lib/dashboard/useApi";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";

type Row = adminCockpitApi.HealthRow;

export default function AdminHealthPage() {
  const router = useRouter();
  const s = useApi(() => browserApi.admin.cockpit.health(), []);
  const cols: Column<Row>[] = [
    { key: "name", header: "Business", mobile: "title", cell: (r) => <span className="font-medium">{r.name}</span> },
    {
      key: "reason",
      header: "Why",
      mobile: "subtitle",
      cell: (r) => (
        <span className="flex flex-col gap-0.5">
          {r.flags.map((f, i) => (
            <span key={f} className="text-meta">
              <span className="font-medium text-fg">{FLAG_LABEL[f]}.</span> <span className="text-fg-muted">{r.reasons[i]}</span>
            </span>
          ))}
        </span>
      ),
    },
    { key: "trend", header: "8 weeks", mobile: "hidden", cell: (r) => <Sparkline values={r.trend} label={`Weekly usage, oldest first: ${r.trend.join(", ")}`} /> },
    { key: "change", header: "Week over week", align: "end", mobile: "hidden", cell: (r) => (r.changePct === null ? "–" : `${r.changePct > 0 ? "+" : ""}${r.changePct}%`) },
    { key: "status", header: "Status", mobile: "trailing", cell: (r) => <BusinessStatus status={r.status} /> },
    { key: "mrr", header: "MRR", align: "end", mobile: "hidden", cell: (r) => (r.mrrCents ? formatMoney(r.mrrCents) : "–") },
    { key: "trade", header: "Trade", mobile: "hidden", cell: (r) => verticalLabel(r.trade) },
    { key: "active", header: "Last active", mobile: "hidden", cell: (r) => (r.lastActiveAt ? formatDate(r.lastActiveAt) : "Never") },
  ];
  const c = s.data?.counts;
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Health" description="Shops that may churn, the most urgent first" />
      <StatBlock
        loading={!s.data}
        items={[
          { label: FLAG_LABEL.payment_failed, value: formatNumber(c?.payment_failed ?? 0), dot: c?.payment_failed ? "negative" : undefined },
          { label: FLAG_LABEL.trial_ending_not_activated, value: formatNumber(c?.trial_ending_not_activated ?? 0), caption: "Ends within 7 days", dot: c?.trial_ending_not_activated ? "accent" : undefined },
          { label: FLAG_LABEL.usage_drop, value: formatNumber(c?.usage_drop ?? 0), caption: "From at least 5 a week", dot: c?.usage_drop ? "accent" : undefined },
          { label: FLAG_LABEL.no_activity_14d, value: formatNumber(c?.no_activity_14d ?? 0), caption: "No stamp, booking or login" },
        ]}
      />
      <DataTable
        caption="Shops at risk"
        columns={cols}
        rows={s.data?.atRisk ?? []}
        rowKey={(r) => r.merchantId}
        loading={s.loading && !s.data}
        error={s.error}
        onRetry={s.reload}
        onRowClick={(r) => router.push(`/admin/businesses/${r.merchantId}`)}
        empty="No shop is at risk right now."
      />
    </div>
  );
}
