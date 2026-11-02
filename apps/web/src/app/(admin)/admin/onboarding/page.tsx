"use client";
import { useState } from "react";
import { PhoneCall } from "lucide-react";
import { PageHeader, Panel, Segmented, Table, TableWrap, Td, Th, Tr } from "@/components/dashboard/kit";
import { FunnelChart, KpiGrid, PanelEmpty, UsageMeter } from "@/components/dashboard/admin/AdminKit";
import { ListAsync } from "@/components/dashboard/ListStates";
import { verticalLabel } from "@/components/ui/VerticalIcon";
import { browserApi } from "@/lib/api/browser";
import { formatNumber } from "@/lib/format";
import { useApi } from "@/lib/dashboard/useApi";

const fmtMinutes = (m: number | null) => (m === null ? "–" : m < 90 ? `${m} min` : m < 2880 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} days`);

/** Who to phone this morning, and where the funnel leaks (launch plan: >= 60% of shops active within 30 days). */
export default function OnboardingFunnelPage() {
  const [days, setDays] = useState<"30" | "90" | "365">("90");
  const f = useApi(() => browserApi.admin.onboardingFunnel(Number(days)), [days]);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        flush
        title="New shop progress"
        description="From signup to 25 members who have visited. Goal: 60% of shops inside 30 days."
        actions={<Segmented label="Period" value={days} onChange={setDays} options={[{ value: "30", label: "30 days" }, { value: "90", label: "90 days" }, { value: "365", label: "Year" }]} />}
      />
      <ListAsync state={f} errorTitle="Couldn't load the onboarding list.">
        {(d) => (
          <>
            <KpiGrid
              label="Activation"
              items={[
                { label: "Activated in 30 days", value: d.activatedIn30dPct === null ? "–" : `${d.activatedIn30dPct}%`, ...(d.activatedIn30dPct === null ? {} : { num: d.activatedIn30dPct, suffix: "%" }), caption: d.activatedIn30dPct === null ? "No shop is 30 days old yet" : "Of shops 30+ days old · goal 60%", alert: d.activatedIn30dPct !== null && d.activatedIn30dPct < 60 ? "warning" : undefined },
                { label: "Median to first stamp", value: fmtMinutes(d.medianMinutesToFirstStamp), caption: "From signup to the first stamp" },
                { label: "Stuck", value: formatNumber(d.stuckNoStamp), num: d.stuckNoStamp, caption: "No first stamp after 48 hours", alert: d.stuckNoStamp ? "negative" : undefined },
                { label: "Behind at day 14", value: formatNumber(d.behindAtDay14), num: d.behindAtDay14, caption: "Fewer than 12 members", alert: d.behindAtDay14 ? "warning" : undefined },
              ]}
            />
            {d.activatedIn30dPct !== null ? <UsageMeter levels={false} label="Activated in 30 days, against the 60% goal" value={d.activatedIn30dPct} max={60} valueText={`${d.activatedIn30dPct}% of a 60% goal`} /> : null}
            <Panel title="Call these first" description="No first stamp after 48 hours, then shops behind pace at day 14" padded={false}>
              {d.callList.length ? (
                <TableWrap>
                  <Table label="Shops to call">
                    <thead>
                      <tr>
                        <Th>Shop</Th>
                        <Th>Type</Th>
                        <Th>Day</Th>
                        <Th>Why</Th>
                        <Th>Phone</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.callList.map((c) => (
                        <Tr key={c.merchantId}>
                          <Td>
                            <a className="font-medium text-fg underline-offset-2 hover:underline" href={`/admin/businesses/${c.merchantId}`}>
                              {c.name}
                            </a>
                            {c.ownerName ? <span className="block text-caption text-fg-muted">{c.ownerName}</span> : null}
                          </Td>
                          <Td>{verticalLabel(c.vertical)}</Td>
                          <Td className="tabular">{c.day}</Td>
                          <Td>{c.reason}</Td>
                          <Td className="tabular">{c.phone ? <a className="text-fg underline-offset-2 hover:underline" href={`tel:${c.phone}`}>{c.phone}</a> : "–"}</Td>
                        </Tr>
                      ))}
                    </tbody>
                  </Table>
                </TableWrap>
              ) : (
                <PanelEmpty icon={PhoneCall} tone="good" title="Nobody to call" description="Every shop has given a first stamp and is on pace." />
              )}
            </Panel>
            <Panel title="Activation funnel" description={`${formatNumber(d.signedUp)} shops signed in this period`}>
              <FunnelChart label="Funnel" steps={d.steps.map((st) => ({ key: st.key, label: st.label, value: st.count }))} />
            </Panel>
            <Panel title="By type" description="Shops signed and shops active" padded={false}>
              <TableWrap>
                <Table label="Activation by type">
                  <thead>
                    <tr>
                      <Th>Type</Th>
                      <Th align="end">Signed</Th>
                      <Th align="end">Active</Th>
                      <Th align="end">Rate</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.byVertical.map((v) => (
                      <Tr key={v.vertical}>
                        <Td>{verticalLabel(v.vertical)}</Td>
                        <Td align="end" className="tabular">{v.signedUp}</Td>
                        <Td align="end" className="tabular">{v.activated}</Td>
                        <Td align="end" className="tabular">{v.pct}%</Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              </TableWrap>
            </Panel>
          </>
        )}
      </ListAsync>
    </div>
  );
}
