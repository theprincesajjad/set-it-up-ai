"use client";
import { useParams } from "next/navigation";
import { useState } from "react";
import type { experimentsApi } from "@ll/shared";
import { Meter, PageHeader, Panel, StatBlock, StatusPill, Table, TableWrap, Td, Th, Tr } from "@/components/dashboard/kit";
import { ListAsync } from "@/components/dashboard/ListStates";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { browserApi } from "@/lib/api/browser";
import { errorMessage } from "@/lib/api/errors";
import { METRIC_LABEL, PAGE_LABEL, STATUS_LABEL, STATUS_TONE, interval, liftText, lookBanner, money, pct, reportCsv, verdictText } from "@/lib/dashboard/experiments";
import { formatDate, formatNumber } from "@/lib/format";
import { useApi } from "@/lib/dashboard/useApi";

type Report = experimentsApi.ExperimentReport;
const GUARD_TONE = { ok: "positive", watch: "accent", red: "negative" } as const;
const GUARD_LABEL = { ok: "OK", watch: "Watch", red: "Red" } as const;

function download(r: Report) {
  const url = URL.createObjectURL(new Blob([reportCsv(r)], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${r.experiment.id}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/** One landing test: exposures, conversions, Wilson intervals, and the lift and p-values only while a planned look is open. */
export default function ExperimentPage() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const rep = useApi(() => browserApi.admin.experiment(id), [id]);
  const [ending, setEnding] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cost, setCost] = useState({ variant: "", dollars: "" });

  const act = async (fn: () => Promise<Report>, done: string) => {
    setBusy(true);
    setError(null);
    try {
      rep.setData(await fn());
      toast({ message: done, tone: "success" });
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <ListAsync state={rep} errorTitle="We could not load this test.">
        {(r) => {
          const e = r.experiment;
          const banner = lookBanner(r);
          const totals = r.arms.reduce((t, a) => ({ startSubmits: t.startSubmits + a.startSubmits, linkLive: t.linkLive + a.linkLive, paid: t.paid + a.paid30d, signedUp: t.signedUp + a.signedUp }), { startSubmits: 0, linkLive: 0, paid: 0, signedUp: 0 });
          const open = r.look !== "none";
          return (
            <>
              <PageHeader
                flush
                back={{ href: "/admin/experiments", label: "Landing tests" }}
                title={e.id}
                description={`${e.pages.map((p) => PAGE_LABEL[p] ?? p).join(", ")} · ${e.arms.map((a) => `${a.variant} ${Math.round(a.weight * 100)}%`).join(" vs ")} · started ${formatDate(e.startedAt)} · deciding metric: ${METRIC_LABEL[e.decidingMetric]}`}
                actions={
                  <>
                    <Button variant="secondary" onClick={() => download(r)}>
                      Export CSV
                    </Button>
                    {r.look === "interim" ? (
                      <Button loading={busy} onClick={() => act(() => browserApi.admin.recordInterimLook(e.id), "Interim look recorded. The p-values are hidden until the horizon.")}>
                        Record interim look
                      </Button>
                    ) : null}
                    {r.status !== "ended" ? (
                      <Button variant="danger" onClick={() => setEnding(true)}>
                        End experiment
                      </Button>
                    ) : null}
                  </>
                }
              />
              {error && !ending ? <Banner tone="danger">{error}</Banner> : null}

              <section aria-label="Horizon" className="flex flex-col gap-3" data-look={r.look}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-body font-medium text-fg">
                    Horizon: <span className="tabular">{formatNumber(r.exposures)}</span> of <span className="tabular">{formatNumber(e.horizonExposures)}</span> exposures
                  </p>
                  <StatusPill tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</StatusPill>
                </div>
                <Meter value={r.exposures} max={e.horizonExposures} label="Exposures toward the horizon" />
                <p className="text-caption text-fg-muted">
                  Interim look at {formatNumber(Math.ceil(e.interimAt * e.horizonExposures))} (α = {e.alphaInterim}){r.interimTakenAt ? `, recorded ${formatDate(r.interimTakenAt)}` : ""} · final at {formatNumber(e.horizonExposures)} (α = {e.alphaFinal}) · baseline {pct(e.baseline, 0)}, minimum effect +{Math.round(e.mde * 100)}%
                </p>
                <Banner tone={banner.tone} title={banner.title}>
                  {banner.body}
                </Banner>
              </section>

              <StatBlock
                items={[
                  { label: "Exposures", value: formatNumber(r.exposures), caption: `${r.horizonPct}% of the horizon` },
                  { label: "Start submits", value: formatNumber(totals.startSubmits), caption: `${formatNumber(totals.signedUp)} signed up` },
                  { label: "Link live", value: formatNumber(totals.linkLive), caption: "Within 7 days of signup" },
                  { label: "Paid", value: formatNumber(totals.paid), caption: "Pro within 30 days" },
                ]}
              />

              <Panel title="Variants" description="Rates are of exposures, with a 95% interval. Lift and p-values against control show only at a planned look." padded={false}>
                <TableWrap>
                  <Table label="Variants">
                    <thead>
                      <tr>
                        <Th>Variant</Th>
                        <Th align="end">Exposures</Th>
                        <Th align="end">Start submits</Th>
                        <Th align="end">Signed up</Th>
                        <Th align="end">Link live</Th>
                        <Th align="end">First booking (7 d)</Th>
                        <Th align="end">Paid (30 d)</Th>
                        <Th align="end">Unmatched</Th>
                        {open ? <Th align="end">Lift on submits</Th> : null}
                        {open ? <Th align="end">Lift on link live</Th> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {r.arms.map((a) => (
                        <Tr key={a.variant} data-arm={a.variant}>
                          <Td className="font-medium">{a.variant}</Td>
                          <Td align="end" className="tabular">{formatNumber(a.exposures)}</Td>
                          <Td align="end" className="tabular">
                            {formatNumber(a.startSubmits)} · {pct(a.rates.startSubmit.p)}
                            <span className="block text-caption text-fg-muted">{interval(a.rates.startSubmit)}</span>
                          </Td>
                          <Td align="end" className="tabular">{formatNumber(a.signedUp)}</Td>
                          <Td align="end" className="tabular">
                            {formatNumber(a.linkLive)} · {pct(a.rates.linkLive.p)}
                            <span className="block text-caption text-fg-muted">{interval(a.rates.linkLive)}</span>
                          </Td>
                          <Td align="end" className="tabular">{formatNumber(a.firstBooking7d)}</Td>
                          <Td align="end" className="tabular">{formatNumber(a.paid30d)}</Td>
                          <Td align="end" className="tabular">{formatNumber(a.unmatchedSignups)}</Td>
                          {open
                            ? (["startSubmit", "linkLive"] as const).map((k) => (
                                <Td key={k} align="end" className="tabular" title={verdictText(a.lift?.[k])}>
                                  {a.lift ? <StatusPill tone={a.lift[k].verdict === "unlikely_chance" ? "positive" : "neutral"}>{liftText(a.lift[k])}</StatusPill> : "–"}
                                </Td>
                              ))
                            : null}
                        </Tr>
                      ))}
                    </tbody>
                  </Table>
                </TableWrap>
                {r.arms.some((a) => a.unmatchedSignups > 0) ? (
                  <p className="px-5 py-3 text-caption text-fg-muted">Unmatched: signups that carry the variant but no counted visit (cookies cleared, Global Privacy Control, another device). They count for the variant; this is not a bug.</p>
                ) : null}
              </Panel>

              <Panel title="Guardrails" description={`Cost per free signup above ${money(e.guardrails.maxCostPerSignupCents)} two weeks running, link live below ${pct(e.guardrails.minLinkLiveShareOfControl, 0)} of control's, or Lighthouse under 90 stops a variant at any time.`} padded={false}>
                <TableWrap>
                  <Table label="Guardrails">
                    <thead>
                      <tr>
                        <Th>Variant</Th>
                        <Th align="end">Cost per signup</Th>
                        <Th align="end">Link live vs control</Th>
                        <Th align="end">Lighthouse</Th>
                        <Th>Status</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.arms.map((a) => (
                        <Tr key={a.variant}>
                          <Td className="font-medium">{a.variant}</Td>
                          <Td align="end" className="tabular">{money(a.guardrails.costPerSignupCents)}</Td>
                          <Td align="end" className="tabular">{a.guardrails.linkLiveShareOfControl === null ? "–" : pct(a.guardrails.linkLiveShareOfControl, 0)}</Td>
                          <Td align="end" className="tabular">{a.guardrails.lighthouse ?? "–"}</Td>
                          <Td>
                            <StatusPill tone={GUARD_TONE[a.guardrails.status]}>{GUARD_LABEL[a.guardrails.status]}</StatusPill>
                          </Td>
                        </Tr>
                      ))}
                    </tbody>
                  </Table>
                </TableWrap>
                {r.status !== "ended" ? (
                  <form
                    className="flex flex-col gap-3 border-t border-border px-5 py-4 sm:flex-row sm:items-end"
                    onSubmit={async (ev) => {
                      ev.preventDefault();
                      const cents = Math.round(Number(cost.dollars) * 100);
                      if (!cost.variant || !Number.isFinite(cents) || cents < 0) return setError("Pick a variant and type the cost in dollars.");
                      if (await act(() => browserApi.admin.addGuardrailInput(e.id, { variant: cost.variant, costPerSignupCents: cents }), "Cost saved.")) setCost({ variant: "", dollars: "" });
                    }}
                  >
                    <Select label="Variant" value={cost.variant} onChange={(ev) => setCost((c) => ({ ...c, variant: ev.target.value }))} placeholder="Choose" options={e.arms.map((a) => ({ value: a.variant, label: a.variant }))} />
                    <TextField label="Cost per free signup this week ($)" inputMode="decimal" value={cost.dollars} onChange={(ev) => setCost((c) => ({ ...c, dollars: ev.target.value }))} />
                    <Button type="submit" variant="secondary" loading={busy}>
                      Save cost
                    </Button>
                  </form>
                ) : null}
              </Panel>

              <div className="grid gap-6 lg:grid-cols-2">
                {(
                  [
                    ["By trade", "Counts only: too small to test.", r.byTrade.map((b) => ({ key: b.trade, ...b }))],
                    ["By source", "Ads, organic and the client loop (?src). Counts only.", r.bySrc.map((b) => ({ key: b.src, ...b }))],
                  ] as const
                ).map(([title, description, rows]) => (
                  <Panel key={title} title={title} description={description} padded={false}>
                    {rows.length ? (
                      <TableWrap>
                        <Table label={title}>
                          <thead>
                            <tr>
                              <Th>{title === "By trade" ? "Trade" : "Source"}</Th>
                              <Th>Variant</Th>
                              <Th align="end">Exposures</Th>
                              <Th align="end">Submits</Th>
                              <Th align="end">Link live</Th>
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map((b) => (
                              <Tr key={`${b.key}-${b.variant}`}>
                                <Td>{b.key}</Td>
                                <Td>{b.variant}</Td>
                                <Td align="end" className="tabular">{formatNumber(b.exposures)}</Td>
                                <Td align="end" className="tabular">{formatNumber(b.startSubmits)}</Td>
                                <Td align="end" className="tabular">{formatNumber(b.linkLive)}</Td>
                              </Tr>
                            ))}
                          </tbody>
                        </Table>
                      </TableWrap>
                    ) : (
                      <p className="px-5 py-6 text-meta text-fg-muted">No visits counted yet.</p>
                    )}
                  </Panel>
                ))}
              </div>

              <Modal
                open={ending}
                onClose={() => setEnding(false)}
                title={`End ${e.id}?`}
                description="The page stops assigning within a minute and everyone sees control. The numbers stay here. This cannot be undone."
                actions={
                  <>
                    <Button variant="secondary" onClick={() => setEnding(false)}>
                      Cancel
                    </Button>
                    <Button
                      variant="danger"
                      disabled={reason.trim().length < 3}
                      loading={busy}
                      onClick={async () => {
                        if (await act(() => browserApi.admin.endExperiment(e.id, reason.trim()), "Test ended.")) {
                          setEnding(false);
                          setReason("");
                        }
                      }}
                    >
                      End experiment
                    </Button>
                  </>
                }
              >
                <div className="flex flex-col gap-3">
                  <TextField label="Reason (goes to the audit log)" value={reason} onChange={(ev) => setReason(ev.target.value)} maxLength={500} />
                  {error ? <Banner tone="danger">{error}</Banner> : null}
                </div>
              </Modal>
            </>
          );
        }}
      </ListAsync>
    </div>
  );
}
