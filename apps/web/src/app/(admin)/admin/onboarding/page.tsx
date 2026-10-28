"use client";
import { useState } from "react";
import { PageHeader, Panel, Segmented, StatBlock, Table, TableWrap, Td, Th, Tr } from "@/components/dashboard/kit";
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
        title="Activation funnel"
        description="Signup to 25 members who have visited. Goal: 60% inside 30 days."
        actions={<Segmented label="Period" value={days} onChange={setDays} options={[{ value: "30", label: "30 days" }, { value: "90", label: "90 days" }, { value: "365", label: "Year" }]} />}
      />
      <ListAsync state={f} errorTitle="We could not load the onboarding list.">
        {(d) => (
          <>
            <StatBlock
              items={[
                { label: "Activated in 30 days", value: d.activatedIn30dPct === null ? "–" : `${d.activatedIn30dPct}%`, caption: d.activatedIn30dPct === null ? "No shop is 30 days old yet" : "Of shops 30+ days old · goal 60%" },
                { label: "Median to first stamp", value: fmtMinutes(d.medianMinutesToFirstStamp), caption: "From signup to the first stamp" },
                { label: "Stuck", value: formatNumber(d.stuckNoStamp), caption: "No first stamp after 48 hours" },
                { label: "Behind at day 14", value: formatNumber(d.behindAtDay14), caption: "Fewer than 12 members" },
              ]}
            />
            <Panel title="From signup to active" description={`${formatNumber(d.signedUp)} shops signed in this period`}>
              <ul className="flex flex-col gap-3" aria-label="Funnel">
                {d.steps.map((s) => (
                  <li key={s.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 text-body text-fg sm:grid-cols-[150px_minmax(0,1fr)_110px]">
                    <span>{s.label}</span>
                    <span className="order-last col-span-2 h-5 rounded-md bg-bg-subtle sm:order-none sm:col-span-1">
                      <span className={`block h-5 rounded-md ${s.key === "activated" ? "bg-points" : "bg-trade"}`} style={{ width: `${Math.max(1, s.pct)}%` }} />
                    </span>
                    <span className="tabular text-meta text-fg-muted sm:text-left text-right">
                      {formatNumber(s.count)} · {s.pct}%
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
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
                            <a className="font-medium text-fg underline-offset-2 hover:underline" href={`/admin/merchants/${c.merchantId}`}>
                              {c.name}
                            </a>
                            {c.ownerName ? <span className="block text-caption text-fg-muted">{c.ownerName}</span> : null}
                          </Td>
                          <Td>{verticalLabel(c.vertical)}</Td>
                          <Td className="tabular">{c.day}</Td>
                          <Td>{c.reason}</Td>
                          <Td className="tabular">{c.phone ?? "–"}</Td>
                        </Tr>
                      ))}
                    </tbody>
                  </Table>
                </TableWrap>
              ) : (
                <p className="px-5 py-6 text-meta text-fg-muted">Nobody is stuck. Every shop has given a first stamp.</p>
              )}
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
