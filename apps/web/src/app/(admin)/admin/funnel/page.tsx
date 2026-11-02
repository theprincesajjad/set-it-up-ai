"use client";
/**
 * Landing and conversion funnel (wave N): landing views → CTA clicks → signup started → signup completed → went live → paid, for all
 * pages and split by landing page, A/B variant, source (src or utm_source) and device. Visitors are counted once each (by the
 * landing page's anonymous id); signups by the landing visit they carried, so a shop a rep signed shows as unattributed.
 */
import { useState } from "react";
import type { adminCockpitApi } from "@ll/shared";
import { PageHeader, Panel, Segmented, Table, Td, Th, Tr } from "@/components/dashboard/kit";
import { ListAsync } from "@/components/dashboard/ListStates";
import { FUNNEL_STEPS, FunnelBars, PeriodPicker, type Period } from "@/components/dashboard/admin/cockpit";
import { QuietLink } from "@/components/dashboard/kit";
import { KpiGrid, PanelEmpty, pctNum } from "@/components/dashboard/admin/AdminKit";
import { MousePointerClick } from "lucide-react";
import { browserApi } from "@/lib/api/browser";
import { useApi } from "@/lib/dashboard/useApi";
import { formatNumber } from "@/lib/format";

const BY_OPTIONS: { value: adminCockpitApi.FunnelDimension; label: string }[] = [
  { value: "page", label: "Landing page" },
  { value: "variant", label: "Variant" },
  { value: "source", label: "Source" },
  { value: "device", label: "Device" },
];
const rate = (n: number, of: number) => (of ? `${Math.round((n / of) * 1000) / 10}%` : "–");

export default function AdminFunnelPage() {
  const [days, setDays] = useState<Period>(30);
  const [by, setBy] = useState<adminCockpitApi.FunnelDimension>("page");
  const s = useApi(() => browserApi.admin.cockpit.funnel(days, by), [days, by]);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Signup funnel" description="From a landing page view to a paying shop" actions={<PeriodPicker value={days} onChange={setDays} />} />
      <ListAsync state={s} errorTitle="Couldn't load the funnel. Reload the page to try again." rows={6}>
        {(d) => (
          <>
            <KpiGrid
              label="Conversion"
              items={[
                { label: "Visitors", value: formatNumber(d.total.views), num: d.total.views, caption: "Viewed a landing page" },
                { label: "Visit to signup", value: rate(d.total.signupCompleted, d.total.views), ...pctNum(d.total.views ? d.total.signupCompleted / d.total.views : 0), caption: `${formatNumber(d.total.signupCompleted)} completed signup` },
                { label: "Signup to live", value: rate(d.total.wentLive, d.total.signupCompleted), ...pctNum(d.total.signupCompleted ? d.total.wentLive / d.total.signupCompleted : 0), caption: `${formatNumber(d.total.wentLive)} went live` },
                { label: "Signup to paid", value: rate(d.total.paid, d.total.signupCompleted), ...pctNum(d.total.signupCompleted ? d.total.paid / d.total.signupCompleted : 0), caption: `${formatNumber(d.total.paid)} paid` },
              ]}
            />
            <Panel title="All landing pages" description={`Last ${days} days. Each visitor counts once per step; the shaded part of a bar is who dropped off since the step before.`}>
              <FunnelBars counts={d.total} />
              <p className="mt-4 text-meta text-fg-muted">
                Visit to signup: <span className="tabular text-fg">{rate(d.total.signupCompleted, d.total.views)}</span> · Signup to paid: <span className="tabular text-fg">{rate(d.total.paid, d.total.signupCompleted)}</span>
              </p>
            </Panel>
            <Panel
              title="Split"
              description="Signups with no landing visit on record are listed as unattributed."
              action={<Segmented label="Split by" options={BY_OPTIONS} value={by} onChange={setBy} />}
              padded={false}
            >
              {d.rows.length ? (
                <div className="overflow-x-auto">
                  <Table label={`Funnel by ${BY_OPTIONS.find((o) => o.value === by)!.label.toLowerCase()}`} className="min-w-[760px]">
                    <thead>
                      <tr>
                        <Th className="md:static">{BY_OPTIONS.find((o) => o.value === by)!.label}</Th>
                        {FUNNEL_STEPS.map((st) => (
                          <Th key={st.key} align="end" className="md:static">
                            {st.label}
                          </Th>
                        ))}
                        <Th align="end" className="md:static">Visit to signup</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.rows.map((r) => (
                        <Tr key={r.key}>
                          <Td className="font-medium">{r.key}</Td>
                          {FUNNEL_STEPS.map((st) => (
                            <Td key={st.key} align="end" className="tabular">
                              {formatNumber(r[st.key])}
                            </Td>
                          ))}
                          <Td align="end" className="tabular">
                            <span className="font-[550]">{rate(r.signupCompleted, r.views)}</span>
                          </Td>
                        </Tr>
                      ))}
                    </tbody>
                  </Table>
                </div>
              ) : (
                <PanelEmpty icon={MousePointerClick} title="No landing visits or signups in this period" description="Try a longer period, or check that the landing pages are live." />
              )}
            </Panel>
            <p className="text-meta text-fg-muted">
              Visitors with Global Privacy Control or counting turned off are never counted. <QuietLink href="/admin/experiments">A/B test reports</QuietLink>
            </p>
          </>
        )}
      </ListAsync>
    </div>
  );
}
