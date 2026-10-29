"use client";
/**
 * Reports, Week (docs/business/pro-value.md 3.2 P6): one week in money, the change against last week, what the waitlist, reminders and
 * reviews brought back, the quietest day, and the last 12 weeks. The week is open to everyone; the 12 weeks and the signals are the
 * weekly report (Pro, Studio and the trial), and Free sees a PlanLine in their place.
 */
import { CalendarPlus, ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { PLANS } from "@ll/shared";
import { BackLink, ErrorLine, PageHeader, Panel, SkeletonRows, Table, TableWrap, Td, Th } from "@/components/dashboard/kit";
import { DeltaChips, GoalBar, TrendBars } from "@/components/dashboard/home/WeekParts";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { NoAccess } from "@/components/dashboard/PageStates";
import { PlanLine } from "@/components/onboarding/PlanLine";
import { Button } from "@/components/ui/Button";
import { billingHref, lockedLines, promoHref, shiftWeek, weekdayLabel } from "@/lib/dashboard/insights";
import { useApi } from "@/lib/dashboard/useApi";
import { useLocaleOrEnglish } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

export default function WeekReportPage() {
  const { api, base, role } = useMerchant();
  const loc = useLocaleOrEnglish();
  const { t } = loc;
  const manager = role !== "staff";
  const [start, setStart] = useState<string | undefined>(undefined);
  const week = useApi(manager ? () => api.insights.week(start) : null, [api, manager, start]);
  const paid = week.data?.paid === true;
  const history = useApi(manager && paid ? () => api.insights.weeks(12) : null, [api, manager, paid]);
  if (!manager) return <NoAccess />;

  const w = week.data;
  const plan = PLANS.plus.name;
  const day = (n: number) => weekdayLabel(loc.date, n);
  const md = (iso: string) => loc.date(`${iso}T12:00:00Z`, { month: "short", day: "numeric" }, "UTC");
  const signed = (cents: number) => (cents === 0 ? "–" : `${cents > 0 ? "+" : "−"}${loc.money(Math.abs(cents))}`);
  const sig = w?.signals;
  const items = sig
    ? [
        { key: "waitlist", label: t("insights.sig.waitlist"), n: sig.waitlist_fills.count, cents: sig.waitlist_fills.amountCents },
        { key: "rebooked", label: t("insights.sig.rebooked"), n: sig.rebook_booked.count, cents: sig.rebook_booked.amountCents },
        { key: "reviews", label: t("insights.sig.reviews"), n: sig.reviews_requested.count, cents: 0 },
        { key: "google", label: t("insights.sig.google"), n: sig.reviews_google.count, cents: 0 },
        { key: "addons", label: t("insights.sig.addons"), n: sig.addons_sold.count, cents: sig.addons_sold.amountCents },
        { key: "promos", label: t("insights.sig.promos"), n: sig.promo_bookings.count, cents: sig.promo_bookings.amountCents },
      ]
    : [];
  const nav = w ? (
    <div className="flex items-center gap-2">
      <Button variant="secondary" size="sm" aria-label={t("insights.page.prev")} onClick={() => setStart(shiftWeek(w.weekStart, -1))}>
        <ChevronLeft aria-hidden className="size-4 rtl:rotate-180" />
        <span className="max-sm:sr-only">{t("insights.page.prev")}</span>
      </Button>
      <Button variant="secondary" size="sm" aria-label={t("insights.page.next")} disabled={w.inProgress} onClick={() => setStart(shiftWeek(w.weekStart, 1))}>
        <span className="max-sm:sr-only">{t("insights.page.next")}</span>
        <ChevronRight aria-hidden className="size-4 rtl:rotate-180" />
      </Button>
    </div>
  ) : null;

  return (
    <div className="flex flex-col gap-4">
      <BackLink href={`${base}/reports`}>{t("insights.page.back")}</BackLink>
      <PageHeader title={t("insights.page.title")} description={t("insights.page.description")} actions={nav} />
      {week.error ? <ErrorLine message={week.error} onRetry={() => void week.reload()} /> : null}
      {!w && week.loading ? <Panel><SkeletonRows rows={3} /></Panel> : null}

      {w ? (
        <>
          <Panel title={t("insights.page.range", { from: md(w.weekStart), to: md(w.weekEnd) })} description={w.inProgress ? t("insights.page.thisWeek") : undefined}>
            <div data-testid="week-hero" className="flex flex-col gap-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div className="flex min-w-0 flex-col gap-2">
                  <p className="flex flex-wrap items-baseline gap-x-2 text-fg">
                    <span data-testid="week-revenue" className="text-display-number tabular-nums">{loc.money(w.revenueCents)}</span>
                    <span className="text-body text-fg-muted">{t("insights.tile.booked")}</span>
                  </p>
                  <DeltaChips w={w} />
                </div>
                <TrendBars trend={w.trend} className="w-48 shrink-0 max-sm:w-full" />
              </div>
              <GoalBar goal={w.goal} />
              <dl className="grid grid-cols-3 gap-4 border-t border-line pt-4">
                {[
                  [t("insights.page.visits"), loc.number(w.visits)],
                  [t("insights.page.newClients"), loc.number(w.newClients)],
                  [t("insights.page.vsAvg"), loc.money(w.fourWeekAvgCents)],
                ].map(([k, v]) => (
                  <div key={k} className="min-w-0">
                    <dt className="text-meta text-fg-muted">{k}</dt>
                    <dd className="text-headline tabular-nums text-fg">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </Panel>

          {w.paid ? (
            <>
              <Panel title={t("insights.page.signals")}>
                <ul data-testid="week-signal-list" className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3">
                  {items.map((i) => (
                    <li key={i.key} className="min-w-0">
                      <p className="text-meta text-fg-muted">{i.label}</p>
                      <p className="text-headline tabular-nums text-fg">
                        {loc.number(i.n)}
                        {i.cents > 0 ? <span className="ms-1.5 text-meta font-normal text-fg-muted">{loc.money(i.cents)}</span> : null}
                      </p>
                    </li>
                  ))}
                </ul>
              </Panel>

              {w.bestDayToPromote ? (
                <Panel title={t("insights.page.quietDay")} description={t("insights.page.quietBody", { day: day(w.bestDayToPromote.weekday) })}>
                  <div className="flex flex-wrap items-center gap-3">
                    {w.promosLeft > 0 ? (
                      <Button href={promoHref(base, w.bestDayToPromote.weekday)} size="md">
                        <CalendarPlus aria-hidden className="size-4" />
                        {t("insights.email.promoCta", { day: day(w.bestDayToPromote.weekday) })}
                      </Button>
                    ) : null}
                    <span className="text-meta text-fg-muted">{t("insights.page.promosLeft", { n: w.promosLeft })}</span>
                  </div>
                </Panel>
              ) : null}

              <Panel title={t("insights.page.history")} padded={false}>
                {history.data ? (
                  <TableWrap>
                    <Table label={t("insights.page.history")}>
                      <thead>
                        <tr>
                          <Th>{t("insights.page.week")}</Th>
                          <Th align="end">{t("insights.page.booked")}</Th>
                          <Th align="end" className="max-sm:hidden">{t("insights.page.visits")}</Th>
                          <Th align="end" className="max-sm:hidden">{t("insights.page.newClients")}</Th>
                          <Th align="end">{t("insights.page.change")}</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...history.data.weeks].reverse().map((r) => (
                          <tr key={r.weekStart}>
                            <Td>{md(r.weekStart)}</Td>
                            <Td align="end" className="tabular-nums">{loc.money(r.revenueCents)}</Td>
                            <Td align="end" className="tabular-nums max-sm:hidden">{loc.number(r.visits)}</Td>
                            <Td align="end" className="tabular-nums max-sm:hidden">{loc.number(r.newClients)}</Td>
                            <Td align="end" className={cn("tabular-nums", r.deltaCents > 0 ? "text-success-text" : "text-fg-muted")}>{signed(r.deltaCents)}</Td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  </TableWrap>
                ) : history.error ? (
                  <div className="p-5"><ErrorLine message={history.error} onRetry={() => void history.reload()} /></div>
                ) : (
                  <div className="p-5"><SkeletonRows rows={4} /></div>
                )}
              </Panel>
            </>
          ) : (
            <Panel>
              <div data-testid="week-locked" className="flex flex-col gap-2">
                {lockedLines(w).map((l) => (
                  <p key={l.kind} className="text-body text-fg-muted">
                    {l.kind === "cancellations" ? t("insights.locked.cancellations", { n: l.n, plan }) : t("insights.locked.fullDay", { n: l.n, day: day(l.weekday), plan })}
                  </p>
                ))}
                <PlanLine linkLabel={t("insights.locked.see", { plan })} href={billingHref(base)}>
                  {t("insights.page.historyLocked", { weekday: day(w.report.weekday), plan })}
                </PlanLine>
              </div>
            </Panel>
          )}
        </>
      ) : null}
    </div>
  );
}
