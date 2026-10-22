"use client";
import { PageHeader, Panel, StatBlock } from "@/components/dashboard/kit";
import { BarChart } from "@/components/dashboard/Charts";
import { NetworkGauges } from "@/components/dashboard/NetworkGauges";
import { Async } from "@/components/dashboard/PageStates";
import { verticalLabel } from "@/components/ui/VerticalIcon";
import { browserApi } from "@/lib/api/browser";
import { formatNumber } from "@/lib/format";
import { useApi } from "@/lib/dashboard/useApi";
import { HBarList } from "@/components/dashboard/Charts";
import { Button } from "@/components/ui/Button";

export default function AdminHome() {
  const d = useApi(() => browserApi.admin.dashboard(), []);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader flush title="Network" description="How dense the network is, and when paid tools can switch on." actions={<Button size="sm" href="/admin/rollout">Rollout control</Button>} />
      <Async state={d}>
        {(n) => (
          <>
            <StatBlock
              items={[
                { label: "Merchants", value: formatNumber(n.merchants.total), caption: `${formatNumber(n.merchants.byStatus.active)} active · ${formatNumber(n.merchants.byStatus.onboarding)} onboarding`, href: "/admin/merchants" },
                { label: "Activated", value: `${Math.round(n.activationRate * 100)}%`, caption: `${formatNumber(n.activatedMerchants)} reached 25 members · goal 60%` },
                { label: "Customers", value: formatNumber(n.customers), caption: `${formatNumber(n.memberships)} memberships` },
                { label: "2+ shops", value: `${Math.round(n.multiShopPct * 100)}%`, caption: `${formatNumber(n.multiShopCustomers)} customers · goal 30%` },
              ]}
            />
            <NetworkGauges activeMerchants={n.merchants.byStatus.active} multiShopPct={n.multiShopPct} />
            <Panel>
              <BarChart title="Weekly visits" subtitle="Last 8 weeks, network-wide · grey: active customers" valueLabel="Visits" compareLabel="Active customers" data={n.weeklyVisits.map((w) => ({ label: w.weekStart.slice(0, 10), value: w.visits, compare: w.activeCustomers }))} />
            </Panel>
            <div className="grid gap-6 lg:grid-cols-2">
              <Panel title="By neighbourhood" description="Merchants (activated)" action={<Button variant="ghost" size="sm" href="/admin/neighbourhoods">Manage</Button>}>
                <HBarList rows={n.merchants.byNeighbourhood.map((x) => ({ key: x.neighbourhoodId ?? "none", label: x.name, value: x.merchants, hint: `${x.activated} activated` }))} />
              </Panel>
              <Panel title="By type">
                <HBarList rows={n.merchants.byVertical.map((x) => ({ key: x.vertical, label: verticalLabel(x.vertical), value: x.count }))} />
              </Panel>
            </div>
          </>
        )}
      </Async>
    </div>
  );
}
