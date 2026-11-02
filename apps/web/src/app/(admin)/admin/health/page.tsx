"use client";
/**
 * Health and churn risk (wave N): shops with a payment failure, a trial ending before the first stamp or booking, usage down more
 * than 40% week over week, or 14 days without a stamp, booking or staff login; most urgent first, each with its reason and its
 * 8-week usage trend (stamps + bookings + logins).
 */
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { CircleCheck } from "lucide-react";
import { PageHeader, QuietLink } from "@/components/dashboard/kit";
import { HealthPill, KpiGrid, PanelEmpty } from "@/components/dashboard/admin/AdminKit";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { BusinessStatus, FLAG_LABEL, Sparkline } from "@/components/dashboard/admin/cockpit";
import { verticalLabel } from "@/components/ui/VerticalIcon";
import { adminCockpitApi } from "@ll/shared";
import { browserApi } from "@/lib/api/browser";
import { useApi } from "@/lib/dashboard/useApi";
import { formatMoney, formatNumber } from "@/lib/format";
import { relativeTime } from "@/lib/dashboard/time";

type Row = adminCockpitApi.HealthRow;

export default function AdminHealthPage() {
  // useSearchParams needs a Suspense boundary; a tile links here with ?flag= to narrow the list.
  return (
    <Suspense>
      <Health />
    </Suspense>
  );
}

function Health() {
  const router = useRouter();
  const flagParam = useSearchParams().get("flag");
  const flag = (adminCockpitApi.HEALTH_FLAGS as readonly string[]).includes(flagParam ?? "") ? (flagParam as adminCockpitApi.HealthFlag) : null;
  const s = useApi(() => browserApi.admin.cockpit.health(), []);
  const cols: Column<Row>[] = [
    {
      key: "name",
      header: "Business",
      mobile: "title",
      cell: (r) => (
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium">{r.name}</span>
          <span className="truncate text-caption text-fg-muted max-md:hidden">{verticalLabel(r.trade)}</span>
        </span>
      ),
    },
    {
      key: "reason",
      header: "Why",
      mobile: "subtitle",
      cell: (r) => (
        <span className="flex flex-col gap-0.5">
          {r.flags.map((f, i) => (
            <span key={f} className="text-meta">
              <span className={f === "payment_failed" ? "font-medium text-destructive-text" : "font-medium text-fg"}>{FLAG_LABEL[f]}.</span> <span className="text-fg-muted">{r.reasons[i]}</span>
            </span>
          ))}
        </span>
      ),
    },
    { key: "trend", header: "8 weeks", mobile: "hidden", cell: (r) => <Sparkline values={r.trend} label={`Weekly usage, oldest first: ${r.trend.join(", ")}`} /> },
    { key: "change", header: "Week over week", align: "end", mobile: "hidden", sortValue: (r) => r.changePct, cell: (r) => (r.changePct === null ? "–" : <span className={r.changePct < 0 ? "font-[550] text-destructive-text" : "text-success-text"}>{`${r.changePct > 0 ? "+" : ""}${r.changePct}%`}</span>) },
    { key: "status", header: "Status", mobile: "trailing", cell: (r) => <BusinessStatus status={r.status} /> },
    { key: "mrr", header: "MRR", align: "end", mobile: "hidden", sortValue: (r) => r.mrrCents, cell: (r) => (r.mrrCents ? formatMoney(r.mrrCents) : "–") },
    { key: "active", header: "Last active", mobile: "hidden", cell: (r) => <span className="whitespace-nowrap">{r.lastActiveAt ? relativeTime(r.lastActiveAt) : "Never"}</span> },
  ];
  const c = s.data?.counts;
  const rows = (s.data?.atRisk ?? []).filter((r) => !flag || r.flags.includes(flag));
  const mrrAtRisk = (s.data?.atRisk ?? []).reduce((a, r) => a + r.mrrCents, 0);
  const tile = (f: adminCockpitApi.HealthFlag) => (flag === f ? "/admin/health" : `/admin/health?flag=${f}`);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Health"
        description={s.data ? `${formatNumber(s.data.atRisk.length)} shops may churn · ${formatMoney(mrrAtRisk)} MRR at risk. Most urgent first; open one to see why.` : "Shops that may churn, the most urgent first"}
        actions={s.data ? <HealthPill tone={c?.payment_failed ? "down" : s.data.atRisk.length ? "warn" : "ok"}>{c?.payment_failed ? `${formatNumber(c.payment_failed)} payment${c.payment_failed === 1 ? "" : "s"} failed` : s.data.atRisk.length ? `${formatNumber(s.data.atRisk.length)} to watch` : "All healthy"}</HealthPill> : null}
      />
      <KpiGrid
        label="Risk flags"
        loading={!s.data}
        items={[
          { label: FLAG_LABEL.payment_failed, href: tile("payment_failed"), active: flag === "payment_failed", value: formatNumber(c?.payment_failed ?? 0), num: c?.payment_failed ?? 0, caption: "Card declined or past due", alert: c?.payment_failed ? "negative" : undefined },
          { label: FLAG_LABEL.trial_ending_not_activated, href: tile("trial_ending_not_activated"), active: flag === "trial_ending_not_activated", value: formatNumber(c?.trial_ending_not_activated ?? 0), num: c?.trial_ending_not_activated ?? 0, caption: "Ends within 7 days", alert: c?.trial_ending_not_activated ? "warning" : undefined },
          { label: FLAG_LABEL.usage_drop, href: tile("usage_drop"), active: flag === "usage_drop", value: formatNumber(c?.usage_drop ?? 0), num: c?.usage_drop ?? 0, caption: "From at least 5 a week", alert: c?.usage_drop ? "warning" : undefined },
          { label: FLAG_LABEL.no_activity_14d, href: tile("no_activity_14d"), active: flag === "no_activity_14d", value: formatNumber(c?.no_activity_14d ?? 0), num: c?.no_activity_14d ?? 0, caption: "No stamp, booking or login" },
        ]}
      />
      {flag ? (
        <p className="flex flex-wrap items-center gap-x-3 text-meta text-fg-muted">
          Showing {formatNumber(rows.length)} with “{FLAG_LABEL[flag]}”. <QuietLink href="/admin/health">Show all</QuietLink>
        </p>
      ) : null}
      <DataTable
        caption="Shops at risk"
        columns={cols}
        rows={rows}
        rowKey={(r) => r.merchantId}
        loading={s.loading && !s.data}
        error={s.error}
        onRetry={s.reload}
        onRowClick={(r) => router.push(`/admin/businesses/${r.merchantId}`)}
        empty={<PanelEmpty icon={CircleCheck} tone="good" title={flag ? `No shop with “${FLAG_LABEL[flag]}”` : "No shop is at risk right now"} description="Payment failures, trials ending before setup, usage drops and quiet shops show here." action={flag ? <QuietLink href="/admin/health">Show all</QuietLink> : undefined} />}
      />
    </div>
  );
}
