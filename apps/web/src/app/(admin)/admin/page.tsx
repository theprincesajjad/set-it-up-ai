"use client";
import { BarChart } from "@/components/dashboard/Charts";
import { NetworkGauges } from "@/components/dashboard/NetworkGauges";
import { Async } from "@/components/dashboard/PageStates";
import { Card, CardHeader } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/Layout";
import { StatTile } from "@/components/ui/StatTile";
import { verticalLabel } from "@/components/ui/VerticalIcon";
import { browserApi } from "@/lib/api/browser";
import { formatDate, formatNumber } from "@/lib/format";
import { useApi } from "@/lib/dashboard/useApi";
import { HBarList } from "@/components/dashboard/Charts";
import { Button } from "@/components/ui/Button";

export default function AdminHome() {
  const d = useApi(() => browserApi.admin.dashboard(), []);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Network" description="How dense the network is, and when paid tools can switch on." actions={<Button href="/admin/rollout">Rollout control</Button>} />
      <Async state={d}>
        {(n) => (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatTile label="Merchants" value={formatNumber(n.merchants.total)} caption={`${formatNumber(n.merchants.byStatus.active)} active · ${formatNumber(n.merchants.byStatus.onboarding)} onboarding`} href="/admin/merchants" />
              <StatTile label="Activated" value={`${Math.round(n.activationRate * 100)}%`} caption={`${formatNumber(n.activatedMerchants)} reached 25 members · goal 60%`} />
              <StatTile label="Customers" value={formatNumber(n.customers)} caption={`${formatNumber(n.memberships)} memberships`} />
              <StatTile label="2+ shops" value={`${Math.round(n.multiShopPct * 100)}%`} caption={`${formatNumber(n.multiShopCustomers)} customers · goal 30%`} />
            </div>
            <NetworkGauges activeMerchants={n.merchants.byStatus.active} multiShopPct={n.multiShopPct} />
            <BarChart title="Weekly visits" subtitle="Last 8 weeks, network-wide" valueLabel="Visits" compareLabel="Active customers" data={n.weeklyVisits.map((w) => ({ label: formatDate(w.weekStart), value: w.visits, compare: w.activeCustomers }))} />
            <div className="grid gap-6 lg:grid-cols-2">
              <Card padding="lg">
                <CardHeader title="By neighbourhood" subtitle="Merchants (activated)" action={<Button variant="ghost" size="sm" href="/admin/neighbourhoods">Manage</Button>} />
                <HBarList rows={n.merchants.byNeighbourhood.map((x) => ({ key: x.neighbourhoodId ?? "none", label: x.name, value: x.merchants, hint: `${x.activated} activated` }))} />
              </Card>
              <Card padding="lg">
                <CardHeader title="By type" />
                <HBarList tone="chart-3" rows={n.merchants.byVertical.map((x) => ({ key: x.vertical, label: verticalLabel(x.vertical), value: x.count }))} />
              </Card>
            </div>
          </>
        )}
      </Async>
    </div>
  );
}
