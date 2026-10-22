"use client";
import { Async } from "@/components/dashboard/PageStates";
import { Badge } from "@/components/ui/Badge";
import { Card, CardHeader } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/Layout";
import { StatTile } from "@/components/ui/StatTile";
import { browserApi } from "@/lib/api/browser";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { useApi } from "@/lib/dashboard/useApi";

/** Earnings (rep-console.md §6): setup pay + activation bonuses. Never commission-only language. */
export default function EarningsPage() {
  const c = useApi(() => browserApi.rep.commission(), []);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Earnings" description="Setup pay for each shop you sign, plus an activation bonus when it reaches 25 active members within 30 days." />
      <Async state={c}>
        {(s) => (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatTile label="Total earned" value={formatMoney(s.totalEarnedCents)} />
              <StatTile label="Setup pay" value={formatMoney(s.signedEarnedCents)} caption={`${formatNumber(s.merchantsSigned)} shops × ${formatMoney(s.rates.signedCents)}`} />
              <StatTile label="Activation bonuses" value={formatMoney(s.activationEarnedCents)} caption={`${formatNumber(s.merchantsActivated)} activated`} />
              <StatTile label="Still possible" value={formatMoney(s.pendingBonusCents)} caption="Bonuses in their 30-day window" />
            </div>
            <Card padding="lg">
              <CardHeader title="By shop" />
              <div className="overflow-x-auto">
                <table className="w-full text-meta">
                  <caption className="sr-only">Earnings by shop</caption>
                  <thead className="text-label text-fg-muted">
                    <tr><th scope="col" className="py-2 text-start">Shop</th><th scope="col" className="py-2 text-start">Signed</th><th scope="col" className="py-2 text-end">Setup pay</th><th scope="col" className="py-2 text-end">Activation bonus</th><th scope="col" className="py-2 text-start ps-3">Status</th></tr>
                  </thead>
                  <tbody>
                    {s.items.map((i) => (
                      <tr key={i.merchantId} className="border-t border-line">
                        <td className="py-2">{i.name}</td>
                        <td className="py-2">{formatDate(i.signedAt)}</td>
                        <td className="py-2 text-end tabular-nums">{formatMoney(i.signedCents)}</td>
                        <td className="py-2 text-end tabular-nums">{formatMoney(i.activationBonusCents)}</td>
                        <td className="py-2 ps-3"><Badge tone={i.bonusStatus === "activated" ? "success" : i.bonusStatus === "pending" ? "info" : "neutral"}>{i.bonusStatus === "activated" ? "Earned" : i.bonusStatus === "pending" ? "Pending" : "Missed"}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )}
      </Async>
    </div>
  );
}
