"use client";
import Link from "next/link";
import { useState } from "react";
import type { autoApi } from "@ll/shared";
import { FeatureGate } from "@/components/dashboard/FeatureGate";
import { Dot, Empty, PageHeader, SkeletonRows, StatBlock, Table, TableWrap, Td, Th, Tr } from "@/components/dashboard/kit";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Async } from "@/components/dashboard/PageStates";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { WASH_PLAN_TONE, planStateLabel } from "@/lib/dashboard/auto";
import { useAction, useApi } from "@/lib/dashboard/useApi";

export default function WashPage() {
  return (
    <FeatureGate keys={["auto.wash"]} title="Wash desk">
      <Wash />
    </FeatureGate>
  );
}

/** Wash desk (Figma frame 5): count a wash by plate, QR or phone, and see who has stopped coming. Plans and punch cards are the membership engine. */
function Wash() {
  const { api, base, role } = useMerchant();
  const toast = useToast();
  const act = useAction();
  const summary = useApi(() => api.auto.washSummary(), [api]);
  const settings = useApi(() => api.auto.settings(), [api]);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<autoApi.WashMemberDto[] | null>(null);
  const [result, setResult] = useState<autoApi.WashCheckInResponse | null>(null);
  const s = summary.data;
  async function find(keepResult = false) {
    if (!keepResult) setResult(null);
    const term = q.trim();
    if (term.length < 2) return;
    const r = await act.run(() => api.auto.washLookup(term));
    if (r) setFound(r.items);
  }
  async function count(m: autoApi.WashMemberDto) {
    const r = await act.run(() => api.auto.washCheckIn({ memberId: m.memberId, source: /^[a-z0-9 -]{2,8}$/i.test(q.trim()) && /\d/.test(q) && /[a-z]/i.test(q) ? "plate" : "manual" }));
    if (r) {
      setResult(r);
      if (r.ok) toast({ message: r.message, tone: "success" });
      await Promise.all([summary.reload(), find(true)]);
    }
  }
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        flush
        title="Wash desk"
        description={`Count a wash by plate, member QR or phone. One wash a day per member${settings.data && settings.data.washMaxPerDay > 1 ? ` (your limit is ${settings.data.washMaxPerDay})` : ""}.`}
        actions={<Button size="sm" variant="secondary" href={`${base}/classes/offers`}>Plans and punch cards</Button>}
      />
      <form
        className="flex max-w-xl flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void find();
        }}
      >
        <TextField label="Plate, phone, name or member code" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ABC 123" autoComplete="off" autoFocus />
        <Button type="submit" size="sm" className="self-start" loading={act.busy} disabled={q.trim().length < 2}>Find</Button>
      </form>
      {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
      {result ? <Banner tone={result.ok ? "success" : "danger"}>{result.message}</Banner> : null}
      {found ? (
        found.length === 0 ? (
          <Empty>Nobody found. The plate must be on the member&apos;s car, or look them up by phone.</Empty>
        ) : (
          <ul className="divide-y divide-line rounded-card border border-line" aria-label="Members found">
            {found.map((m) => (
              <li key={m.memberId} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="text-body text-fg">{m.name ?? "No name"}{m.vehicleLabel ? <span className="ms-2 text-meta text-fg-muted">{m.vehicleLabel}</span> : null}</div>
                  <div className="text-meta text-fg-muted">
                    {m.plan ? <Dot tone={WASH_PLAN_TONE[m.plan.state] ?? "neutral"}>{`${m.plan.name}, ${planStateLabel(m.plan.state).toLowerCase()}`}</Dot> : m.punch ? <Dot tone="positive">{`${m.punch.name}, ${m.punch.left} left`}</Dot> : <Dot tone="neutral">No plan or card</Dot>}
                    <span className="ms-3">{m.washesThisMonth} {m.washesThisMonth === 1 ? "wash" : "washes"} this month</span>
                    {m.washedToday ? <span className="ms-3">washed today</span> : null}
                  </div>
                </div>
                <Button size="sm" disabled={act.busy} aria-label={`Count a wash for ${m.name ?? "this member"}`} onClick={() => void count(m)}>Count a wash</Button>
              </li>
            ))}
          </ul>
        )
      ) : null}
      <StatBlock
        label="Wash plans"
        loading={!s}
        items={[
          { label: "Plan members", value: s?.members ?? 0, caption: "active plans" },
          { label: "Washes today", value: s?.washesToday ?? 0, caption: "plans and punch cards" },
          { label: "Average a member", value: s?.avgPerMember30d ?? "none", caption: "plan washes, last 30 days" },
          { label: "Punch cards open", value: s?.punchCardsOpen ?? 0, caption: "with washes left" },
        ]}
      />
      <Async state={summary} skeleton={<SkeletonRows rows={4} />}>
        {(r) => (
          <div className="flex flex-col gap-2">
            <h2 className="text-headline text-fg">Stopped coming</h2>
            <p className="text-meta text-fg-muted">Plan members with fewer than three washes in the last 30 days (plans under two weeks old are left out). A text or a call now is cheaper than a cancelled plan.</p>
            {r.atRisk.length === 0 ? (
              <Empty>Every plan member has come at least three times this month.</Empty>
            ) : (
              <TableWrap>
                <Table label="Members who stopped coming">
                  <thead>
                    <tr>
                      <Th>Member</Th>
                      <Th>Plan</Th>
                      <Th align="end">Washes, 30 days</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.atRisk.map((m) => (
                      <Tr key={m.memberId}>
                        <Td className="font-medium">{m.name ?? "No name"}</Td>
                        <Td className="text-fg-muted">{m.planName}</Td>
                        <Td align="end" className="tabular-nums">{m.washes30d}</Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              </TableWrap>
            )}
          </div>
        )}
      </Async>
      {role !== "staff" ? <DailyCap settings={settings.data} reload={settings.reload} /> : null}
      <p className="text-meta text-fg-muted">Camera plate readers fail 2 to 5% of the time, so there is always the QR on the member&apos;s phone or their phone number. Cancelling a plan is a button in the member&apos;s app. <Link href={`${base}/classes/offers`} className="underline">Edit plans, prices and the agreement text</Link>.</p>
    </div>
  );
}

function DailyCap({ settings, reload }: { settings: autoApi.AutoSettingsDto | null; reload: () => Promise<unknown> }) {
  const { api } = useMerchant();
  const toast = useToast();
  const act = useAction();
  return (
    <div className="flex max-w-xs items-end gap-3">
      <TextField label="Washes a day per member" inputMode="numeric" defaultValue={settings ? String(settings.washMaxPerDay) : ""} key={settings?.washMaxPerDay ?? "none"} disabled={!settings} onBlur={async (e) => {
        const n = Number(e.target.value.replace(/[^\d]/g, ""));
        if (!settings || !n || n === settings.washMaxPerDay) return;
        const r = await act.run(() => api.auto.saveSettings({ washMaxPerDay: n }));
        if (r) toast({ message: `Limit is now ${r.washMaxPerDay} a day`, tone: "success" });
        await reload();
      }} />
    </div>
  );
}
