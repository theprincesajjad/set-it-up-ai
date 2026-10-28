"use client";
import { Download } from "lucide-react";
import { useState } from "react";
import { FeatureGate } from "@/components/dashboard/FeatureGate";
import { PageHeader, StatBlock, Table, TableWrap, Td, Th, Tr, Segmented } from "@/components/dashboard/kit";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { ListAsync } from "@/components/dashboard/ListStates";
import { Button } from "@/components/ui/Button";
import { money } from "@/lib/dashboard/calendar";
import { modelLabel, weekRange } from "@/lib/dashboard/queue";
import { useApi } from "@/lib/dashboard/useApi";
import { BFF_BASE } from "@/lib/api/browser";

export default function PayoutsPage() {
  return (
    <FeatureGate keys={["staff.payouts"]} title="Payouts">
      <Payouts />
    </FeatureGate>
  );
}

/** Payouts (docs/research/barbers-beauty.md, Figma frame 3): a report, not a payment. */
function Payouts() {
  const { api, role } = useMerchant();
  const today = new Date().toLocaleDateString("en-CA");
  const [which, setWhich] = useState<"this" | "last">("this");
  const range = weekRange(today, which === "this" ? 0 : -1);
  const state = useApi(() => api.barber.payouts(range), [api, range.from, range.to]);
  const d = state.data;
  const mine = d?.mine ?? role === "staff";
  const exportHref = `${BFF_BASE}${api.base}/payouts.csv?from=${range.from}&to=${range.to}`;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        flush
        title="Payouts"
        description={mine ? "Your own chair: services, tips and what you take home. Other barbers' numbers and clients are not shown." : "A report, not a payment. You pay your barbers the way you do today."}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Segmented label="Week" value={which} onChange={setWhich} options={[{ value: "this", label: "This week" }, { value: "last", label: "Last week" }]} />
            <Button size="sm" variant="secondary" iconStart={Download} href={exportHref}>Download CSV</Button>
          </div>
        }
      />
      <StatBlock
        label="Payout totals"
        cols={mine ? 4 : 5}
        loading={!d}
        items={[
          { label: "Services", value: money(d?.totals.servicesCents ?? 0), caption: `from ${d?.totals.visits ?? 0} visits` },
          { label: "Tips", value: money(d?.totals.tipsCents ?? 0), caption: "to the barber they were left for" },
          { label: mine ? "Shop keeps" : "Shop keeps", value: money(d?.totals.shopKeepsCents ?? 0), caption: "commission and employee services" },
          { label: "Rent due", value: money(d?.totals.rentCents ?? 0), caption: `${d?.rows.filter((r) => r.model === "chair_rent").length ?? 0} renters` },
          ...(mine ? [] : [{ label: "Shop income", value: money((d?.totals.shopKeepsCents ?? 0) + (d?.totals.rentCents ?? 0)), caption: "what the shop keeps plus rent" }]),
        ]}
      />
      <ListAsync state={state} label="Loading payouts" errorTitle="We could not load your payouts." rows={4}>
        {(r) => (
          <TableWrap>
            <Table label="Payouts by barber">
              <thead>
                <tr>
                  <Th>Barber</Th>
                  <Th>Model</Th>
                  <Th align="end">Visits</Th>
                  <Th align="end">Services</Th>
                  <Th align="end">Tips</Th>
                  <Th align="end">Shop keeps</Th>
                  <Th align="end">Rent</Th>
                  <Th align="end">Takes home</Th>
                </tr>
              </thead>
              <tbody>
                {r.rows.length === 0 ? (
                  <tr>
                    <Td colSpan={8} className="text-fg-muted">No paid visits this week yet. Set how each barber is paid on the Staff page.</Td>
                  </tr>
                ) : (
                  r.rows.map((x) => (
                    <Tr key={x.staffId}>
                      <Td className="font-medium">{x.name}</Td>
                      <Td className="text-fg-muted">{modelLabel(x.model, x.shopShareBps)}</Td>
                      <Td align="end">{x.visits}</Td>
                      <Td align="end">{money(x.servicesCents)}</Td>
                      <Td align="end">{money(x.tipsCents)}</Td>
                      <Td align="end">{money(x.shopKeepsCents)}</Td>
                      <Td align="end">{money(x.rentCents)}</Td>
                      <Td align="end" className="font-semibold">{money(x.takeHomeCents)}</Td>
                    </Tr>
                  ))
                )}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </ListAsync>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-card bg-bg-subtle px-5 py-4">
          <p className="text-meta-strong text-fg">What a renter sees when they sign in</p>
          <p className="mt-1 text-meta text-fg-muted">Only their own chair: their appointments, queue calls, tips and this row. Not other barbers&apos; names, phone numbers or prices, and not the customer list. Set per person in Staff.</p>
        </div>
        <div className="rounded-card bg-card shadow-card px-5 py-4">
          <p className="text-meta-strong text-fg">How each number is made</p>
          <p className="mt-1 text-meta text-fg-muted">Services are paid visits before tax and tip. Tips go to the barber they were left for, cash tips as recorded at the counter. Shop keeps is the commission share. Rent is the weekly amount, shown and not collected. Takes home is services minus what the shop keeps and rent, plus tips. Rent is spread over the days shown, so early in the week it can show below zero until the cuts catch up. A free cut earned on the shop card is a discount on that visit, so it comes off the barber&apos;s services unless the shop covers it: tell chair renters before you put a shop-wide card on the stand. An employee&apos;s wage is outside the app, so they take home their tips.</p>
        </div>
      </div>
    </div>
  );
}
