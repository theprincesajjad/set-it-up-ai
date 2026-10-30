"use client";
/**
 * Waitlist (phase-pro P2, docs/business/pro-value.md §3.2 P2): who asked for a spot, what they want and when, and what happened.
 * Desktop: a table (Name · Wants · When · Asked · Status). Phone: one card per client. "Offer a slot" picks from the next openings that
 * suit the ask (Pro, Studio, the trial); on Free the button is locked and the quiet plan line says what Pro would do.
 */
import { ListPlus, Lock, MessageCircle, Plus, Send, Trash2 } from "lucide-react";
import { useState } from "react";
import { PLANS, type waitlistApi } from "@ll/shared";
import { FeatureGate } from "@/components/dashboard/FeatureGate";
import { EmptyState, PageHeader, PageTabs, StatusPill, Table, TableWrap, Td, Th, Tr, type DotTone } from "@/components/dashboard/kit";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Async } from "@/components/dashboard/PageStates";
import { useMessageCustomer } from "@/components/dashboard/inbox/useMessageCustomer";
import { PlanLine } from "@/components/onboarding/PlanLine";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useLocaleOrEnglish } from "@/lib/i18n/client";
import { useAction, useApi, useNow } from "@/lib/dashboard/useApi";
import { PREF_KEY, seeProHref, timeLeft, useWaitlistApi, windowLabel } from "@/lib/dashboard/waitlist";
import { AddClientDialog, OfferSlotDialog } from "./WaitlistDialogs";

type Entry = waitlistApi.WaitlistEntryDto;

export default function WaitlistPage() {
  const { t } = useLocaleOrEnglish();
  return (
    <FeatureGate keys={["booking.appointments"]} title={t("wl.page.title")}>
      <Waitlist />
    </FeatureGate>
  );
}

const TONE: Record<waitlistApi.WaitlistStatus, DotTone> = { waiting: "info", offered: "accent", booked: "positive", expired: "neutral", removed: "neutral" };

function Waitlist() {
  const { base, detail } = useMerchant();
  const { t, date, time } = useLocaleOrEnglish();
  const api = useWaitlistApi();
  const toast = useToast();
  const act = useAction();
  const message = useMessageCustomer();
  const now = useNow();
  const tz = detail.merchant.timezone;
  const [tab, setTab] = useState<"open" | "all">("open");
  const [adding, setAdding] = useState(false);
  const [offering, setOffering] = useState<Entry | null>(null);
  const state = useApi(() => api.list({ status: tab }), [api, tab], { pollMs: 30_000 });

  const statusText = (e: Entry) => (e.status === "offered" && e.offerExpiresAt ? t("wl.status.offered", { left: timeLeft(t, e.offerExpiresAt, now) }) : t(`wl.status.${e.status}`));
  const wants = (e: Entry) => (e.staffName ? t("wl.wantsWith", { service: e.serviceName, name: e.staffName.split(" ")[0]! }) : e.serviceName);
  const when = (e: Entry) => `${windowLabel(date, e.windowStart, e.windowEnd)} · ${t(PREF_KEY[e.timePref])}`;
  const slot = (e: Entry) => (e.offeredSlot ? `${date(e.offeredSlot.startsAt, { weekday: "short", month: "short", day: "numeric" }, tz)}, ${time(e.offeredSlot.startsAt, tz)}` : null);
  const asked = (e: Entry) => date(e.createdAt, { month: "short", day: "numeric" }, tz);

  async function remove(e: Entry) {
    const r = await act.run(() => api.remove(e.id).then(() => true));
    if (r) {
      toast({ message: t("wl.removed"), tone: "success" });
      await state.reload();
    }
  }

  const actions = (e: Entry, auto: boolean, compact = false) =>
    e.status === "waiting" || e.status === "offered" ? (
      <div className="flex flex-wrap items-center gap-2">
        {e.status === "waiting" ? (
          auto ? (
            <Button size="sm" variant="secondary" iconStart={Send} disabled={!e.customer.userId} onClick={() => setOffering(e)}>{t("wl.offerSlot")}</Button>
          ) : (
            <Button size="sm" variant="secondary" iconStart={Lock} href={seeProHref(base)} aria-label={`${t("wl.offerSlot")}. ${t("wl.seePro", { plan: PLANS.plus.name })}`}>{t("wl.offerSlot")}</Button>
          )
        ) : null}
        {e.customer.userId ? (
          <Button size="sm" variant="ghost" iconStart={MessageCircle} loading={message.busy} onClick={() => message.open({ userId: e.customer.userId! })} aria-label={`${t("wl.message")} ${e.customer.name}`}>{compact ? t("wl.message") : null}</Button>
        ) : null}
        <Button size="sm" variant="ghost" iconStart={Trash2} onClick={() => void remove(e)} aria-label={`${t("wl.remove")} ${e.customer.name}`}>{compact ? t("wl.remove") : null}</Button>
      </div>
    ) : null;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        flush
        title={t("wl.page.title")}
        description={state.data && !state.data.autoOffer ? t("wl.page.subFree") : t("wl.page.sub")}
        actions={<Button size="sm" iconStart={Plus} onClick={() => setAdding(true)}>{t("wl.add.cta")}</Button>}
      />
      {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
      <Async state={state}>
        {(d) => (
          <>
            {!d.autoOffer && d.waiting > 0 ? (
              <PlanLine linkLabel={t("wl.seePro", { plan: PLANS.plus.name })} href={seeProHref(base)} className="-mt-1" >
                {t("wl.free.line", { n: d.waiting, plan: PLANS.plus.name })}
              </PlanLine>
            ) : null}
            <PageTabs label={t("wl.page.title")} value={tab} onChange={setTab} items={[{ id: "open", label: t("wl.tab.open"), count: d.waiting }, { id: "all", label: t("wl.tab.all") }]} />
            {!d.items.length ? (
              <EmptyState icon={ListPlus} title={t("wl.empty.title")} description={t("wl.empty.body")} action={<Button size="sm" variant="secondary" iconStart={Plus} onClick={() => setAdding(true)}>{t("wl.add.cta")}</Button>} />
            ) : (
              <>
                {/* Desktop: the table. */}
                <div className="hidden md:block">
                  <TableWrap>
                    <Table label={t("wl.page.title")}>
                      <thead>
                        <tr>
                          <Th>{t("wl.col.name")}</Th>
                          <Th>{t("wl.col.wants")}</Th>
                          <Th>{t("wl.col.when")}</Th>
                          <Th>{t("wl.col.asked")}</Th>
                          <Th>{t("wl.col.status")}</Th>
                          <Th align="end"><span className="sr-only">{t("wl.col.actions")}</span></Th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.items.map((e) => (
                          <Tr key={e.id} data-testid="wl-row">
                            <Td>
                              <bdi className="text-body-strong">{e.customer.name}</bdi>
                              {e.source === "staff" ? <span className="ms-2 text-caption text-fg-muted">{t("wl.source.staff")}</span> : null}
                            </Td>
                            <Td>{wants(e)}</Td>
                            <Td>{when(e)}</Td>
                            <Td className="tabular-nums text-fg-muted">{asked(e)}</Td>
                            <Td>
                              <StatusPill tone={TONE[e.status]}>{statusText(e)}</StatusPill>
                              {slot(e) ? <span className="ms-2 text-caption text-fg-muted">{slot(e)}</span> : null}
                            </Td>
                            <Td align="end">{actions(e, d.autoOffer)}</Td>
                          </Tr>
                        ))}
                      </tbody>
                    </Table>
                  </TableWrap>
                </div>
                {/* Phone: one card per client. */}
                <ul className="flex flex-col gap-3 md:hidden" aria-label={t("wl.page.title")}>
                  {d.items.map((e) => (
                    <li key={e.id} data-testid="wl-card" className="card-clear flex flex-col gap-2 rounded-card bg-card p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-body-strong text-fg"><bdi>{e.customer.name}</bdi></p>
                          <p className="text-meta text-fg-muted">{wants(e)}</p>
                        </div>
                        <StatusPill tone={TONE[e.status]}>{statusText(e)}</StatusPill>
                      </div>
                      <p className="text-meta text-fg">{when(e)}</p>
                      <p className="text-caption text-fg-muted">{slot(e) ?? t("wl.askedOn", { date: asked(e) })}</p>
                      {actions(e, d.autoOffer, true)}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </Async>
      <AddClientDialog open={adding} onClose={() => setAdding(false)} onSaved={async () => { setAdding(false); toast({ message: t("wl.add.saved"), tone: "success" }); await state.reload(); }} />
      {offering ? <OfferSlotDialog entry={offering} tz={tz} onClose={() => setOffering(null)} onSent={async (name) => { setOffering(null); toast({ message: t("wl.offer.sent", { name }), tone: "success" }); await state.reload(); }} /> : null}
    </div>
  );
}
