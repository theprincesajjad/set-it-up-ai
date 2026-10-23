"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { MessageKey, tiffinApi } from "@ll/shared";
import { PaymentBox, pollUntil } from "@/components/pass/PaymentBox";
import { SetupBox } from "@/components/pass/SetupBox";
import { cardLabel } from "@/components/pass/cardLabel";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorState } from "@/components/ui/EmptyState";
import { Skeleton, SkeletonGroup } from "@/components/ui/Skeleton";
import { TextField } from "@/components/ui/TextField";
import { browserApi, browserClient } from "@/lib/api/browser";
import { errorMessage } from "@/lib/api/errors";
import { restaurantCustomerApi } from "@/lib/restaurant/api";
import { addDays, dayDate, todayIso } from "@/lib/restaurant/util";
import { Heading, Pill, ShopHead, useFmt } from "./ui";

const api = restaurantCustomerApi(browserClient);

type Sub = tiffinApi.MySubscriptionDto;
type Meal = tiffinApi.UpcomingDelivery;

const MEAL_STATUS: Record<Meal["status"], MessageKey> = {
  scheduled: "rc.tm.scheduled",
  skipped: "rc.tm.skipped",
  out_for_delivery: "rc.tm.outForDelivery",
  delivered: "rc.tm.delivered",
  picked_up: "rc.tm.pickedUp",
  missed: "rc.tm.missed",
  paused: "tiffin.paused",
  on_hold: "rc.tm.onHold",
};

/** /me/tiffin: every subscription with upcoming meals, skip / undo, pause, resume, cancel, address, charges, retry payment. */
export function TiffinManage() {
  const { t } = useFmt();
  const [subs, setSubs] = useState<Sub[] | null>(null);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, u] = await Promise.all([api.tiffin.mine(), api.tiffin.upcoming({ days: 14 })]);
      setSubs(s.items);
      setMeals(u.items);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    // Initial fetch; load() only sets state after its awaits.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  if (failed && !subs)
    return (
      <ErrorState
        title={t("rc.error.title")}
        description={t("rc.error.body")}
        action={
          <Button variant="secondary" onClick={() => void load()}>
            {t("rc.tryAgain")}
          </Button>
        }
      />
    );
  if (!subs)
    return (
      <SkeletonGroup label={t("rc.loading")} className="flex flex-col gap-4">
        <Skeleton className="h-44 w-full rounded-card" />
        <Skeleton className="h-44 w-full rounded-card" />
      </SkeletonGroup>
    );
  if (subs.length === 0)
    return <EmptyState title={t("rc.tm.empty")} description={t("rc.tm.emptyBody")} action={<Button href="/map">{t("rc.tm.find")}</Button>} />;

  const live = subs.filter((s) => s.status !== "cancelled");
  const ended = subs.filter((s) => s.status === "cancelled");
  return (
    <div className="flex flex-col gap-6">
      {[...live, ...ended].map((s) => (
        <SubscriptionCard key={s.id} sub={s} meals={meals.filter((m) => m.subscriptionId === s.id)} reload={load} />
      ))}
    </div>
  );
}

function SubscriptionCard({ sub, meals, reload }: { sub: Sub; meals: Meal[]; reload: () => Promise<void> }) {
  const { t, money, date, number } = useFmt();
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ tone: "success" | "danger" | "info"; text: string } | null>(null);
  const [panel, setPanel] = useState<null | "pause" | "address" | "cancel" | "charges">(null);
  const [until, setUntil] = useState(addDays(todayIso(), 8));
  const [address, setAddress] = useState(sub.address ?? "");
  const [postal, setPostal] = useState(sub.postalCode ?? "");
  const [notes, setNotes] = useState(sub.addressNotes ?? "");
  const [charges, setCharges] = useState<tiffinApi.ChargeDto[] | null>(null);
  const [payment, setPayment] = useState<tiffinApi.PaymentIntentRef | null>(null);
  const [setup, setSetup] = useState<tiffinApi.PaymentMethodSetupResponse | null>(null);

  const cancelled = sub.status === "cancelled";
  const needsPayment = sub.status === "past_due" || sub.status === "pending" || sub.latestCharge?.status === "failed";
  const statusLabel: Record<Sub["status"], string> = { pending: t("rc.tm.pending"), active: t("tiffin.active"), paused: t("tiffin.paused"), past_due: t("rc.tm.pastDue"), cancelled: t("rc.tm.cancelled") };
  const cadence = t(sub.plan.cadence === "weekly" ? "rc.tf.weekly" : "rc.tf.monthly");

  async function run(key: string, fn: () => Promise<string | void>) {
    setBusy(key);
    setNote(null);
    try {
      const msg = await fn();
      if (msg) setNote({ tone: "success", text: msg });
      await reload();
    } catch (e) {
      setNote({ tone: "danger", text: errorMessage(e) });
    } finally {
      setBusy(null);
    }
  }

  async function toggleCharges() {
    if (panel === "charges") return setPanel(null);
    setPanel("charges");
    if (!charges) {
      try {
        setCharges((await api.tiffin.detail(sub.id)).charges);
      } catch {
        setCharges([]);
      }
    }
  }

  const chargeStatus: Record<tiffinApi.ChargeDto["status"], string> = { paid: t("rc.tm.chargePaid"), pending: t("rc.tm.chargePending"), failed: t("rc.tm.chargeFailed"), refunded: t("rc.tm.chargeRefunded") };

  return (
    <article className="flex flex-col gap-4 rounded-card border border-line p-4" aria-label={sub.plan.name}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <ShopHead shop={sub.merchant} href={`/shops/${encodeURIComponent(sub.merchant.slug)}/tiffin`} />
        </div>
        <Pill>{statusLabel[sub.status]}</Pill>
      </div>
      <div>
        <Heading level={2} className="break-words">
          {sub.plan.name}
        </Heading>
        <p className="mt-1 text-meta text-fg-muted">
          {[t("rc.tm.servings", { n: sub.servings }), sub.fulfilment === "delivery" ? t("rc.tm.fulfilDelivery") : t("rc.tm.fulfilPickup"), t("rc.tf.per", { price: money(sub.priceCents), cadence })].join(" · ")}
        </p>
        <p className="text-meta text-fg-muted">
          {sub.status === "paused" && sub.pausedUntil ? t("rc.tm.pausedUntil", { date: date(dayDate(sub.pausedUntil), { month: "short", day: "numeric" }, "UTC") }) : !cancelled && sub.nextBillingDate ? t("rc.tm.nextBill", { date: date(dayDate(sub.nextBillingDate), { month: "short", day: "numeric" }, "UTC") }) : null}
        </p>
      </div>

      {note ? <Banner tone={note.tone}>{note.text}</Banner> : null}

      {needsPayment && !cancelled ? (
        payment ? (
          <div className="flex flex-col gap-3">
            <PaymentBox
              paymentIntentId={payment.paymentIntentId}
              clientSecret={payment.clientSecret}
              amountCents={payment.amountCents}
              label={t("rc.tm.retryTitle", { amount: money(payment.amountCents) })}
              onPaid={async () => {
                await pollUntil(async () => (await api.tiffin.detail(sub.id)).subscription.status === "active");
                setPayment(null);
                await reload();
              }}
            />
          </div>
        ) : (
          <Banner tone="info" action={undefined}>
            <p>{t("rc.tm.retryBody")}</p>
            <Button
              className="mt-3"
              size="sm"
              loading={busy === "retry"}
              onClick={() =>
                run("retry", async () => {
                  const r = await api.tiffin.retryPayment(sub.id);
                  if (r.payment) setPayment(r.payment);
                })
              }
            >
              {t("rc.tm.retry")}
            </Button>
          </Banner>
        )
      ) : null}

      {!cancelled ? (
        <section aria-label={t("rc.tm.cardOnFile")} className="flex flex-col gap-3 border-t border-line pt-3">
          <div className="flex items-center justify-between gap-3">
            <p className="min-w-0 text-meta text-fg-muted">
              {sub.cardOnFile ? (
                <>
                  {t(sub.cardOnFile.type === "pad" ? "rc.tm.bankOnFile" : "rc.tm.cardOnFile")} <bdi className="text-body-strong tabular-nums text-fg">{cardLabel(sub.cardOnFile)}</bdi>
                </>
              ) : (
                t("rc.tm.cardNone")
              )}
            </p>
            {setup ? null : (
              <Button
                size="sm"
                variant="secondary"
                loading={busy === "card"}
                onClick={() =>
                  run("card", async () => {
                    setSetup(await api.tiffin.paymentMethod(sub.id));
                  })
                }
              >
                {t("rc.tm.cardChange")}
              </Button>
            )}
          </div>
          {setup ? (
            <div className="flex flex-col gap-3 rounded-card bg-bg-subtle p-4">
              <Heading level={3}>{t("rc.tm.cardChanging")}</Heading>
              <p className="text-meta text-fg-muted">{t("rc.tm.cardChangeBody")}</p>
              <SetupBox
                setupIntentId={setup.setupIntentId}
                clientSecret={setup.clientSecret}
                label={t("paySetup.save")}
                onSaved={async () => {
                  // The API saves the card from Stripe's webhook; wait for it to show on the setup.
                  const ok = await pollUntil(async () => {
                    const v = await browserApi.public.setupIntent(setup.setupIntentId, setup.clientSecret);
                    return v.status === "succeeded" && !!v.cardOnFile;
                  });
                  setSetup(null);
                  setNote({ tone: ok ? "success" : "info", text: ok ? t("rc.tm.cardSaved") : t("paySetup.slow") });
                  await reload();
                }}
              />
              <Button variant="ghost" size="sm" className="self-start" onClick={() => setSetup(null)}>
                {t("rc.tm.cardKeep")}
              </Button>
            </div>
          ) : null}
        </section>
      ) : null}

      {!cancelled ? (
        <section aria-label={t("rc.tm.upcoming")} className="flex flex-col">
          <h3 className="pb-1 text-meta-strong text-fg">{t("rc.tm.upcoming")}</h3>
          {meals.length === 0 ? (
            <p className="py-2 text-meta text-fg-muted">{t("rc.tm.noUpcoming")}</p>
          ) : (
            <ul>
              {meals.map((m) => {
                const skipped = m.status === "skipped";
                return (
                  <li key={m.date} className="flex items-start gap-3 border-t border-line py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-body-strong text-fg">{date(dayDate(m.date), { weekday: "short", month: "short", day: "numeric" }, "UTC")}</p>
                      <p className={`text-meta ${skipped ? "text-fg-subtle line-through" : "text-fg-muted"}`}>{m.menu.length ? m.menu.map((i) => i.name).join(", ") : t("rc.tm.menuTba")}</p>
                      <p className="mt-0.5 text-caption text-fg-muted">
                        {[t(MEAL_STATUS[m.status]), m.canSkip ? t("rc.tm.skipBy", { when: date(m.cutoffAt, { weekday: "short", hour: "numeric", minute: "2-digit" }) }) : m.status === "scheduled" ? t("rc.tm.cutoffPassed") : null, m.servings > 1 ? t("rc.tm.servings", { n: number(m.servings) }) : null].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    {m.canSkip && (m.status === "scheduled" || skipped) ? (
                      <Button
                        size="sm"
                        variant={skipped ? "tonal" : "secondary"}
                        loading={busy === `skip-${m.date}`}
                        onClick={() =>
                          run(`skip-${m.date}`, async () => {
                            if (skipped) await api.tiffin.unskip(sub.id, m.date);
                            else {
                              const r = await api.tiffin.skip(sub.id, [m.date]);
                              return r.creditCents > 0 ? t("rc.tm.skipCredit", { amount: money(r.creditCents) }) : undefined;
                            }
                          })
                        }
                      >
                        {skipped ? t("rc.tm.undo") : t("rc.tm.skip")}
                      </Button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : null}

      {!cancelled ? (
        <div className="flex flex-wrap gap-2 border-t border-line pt-4">
          {sub.status === "paused" ? (
            <Button size="sm" loading={busy === "resume"} onClick={() => run("resume", async () => (await api.tiffin.resume(sub.id), t("rc.tm.resumed")))}>
              {t("rc.tm.resume")}
            </Button>
          ) : sub.status === "active" ? (
            <Button size="sm" variant="secondary" onClick={() => setPanel(panel === "pause" ? null : "pause")} aria-expanded={panel === "pause"}>
              {t("rc.tm.pause")}
            </Button>
          ) : null}
          {sub.fulfilment === "delivery" ? (
            <Button size="sm" variant="secondary" onClick={() => setPanel(panel === "address" ? null : "address")} aria-expanded={panel === "address"}>
              {t("rc.tm.editAddress")}
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" onClick={() => setPanel(panel === "cancel" ? null : "cancel")} aria-expanded={panel === "cancel"}>
            {t("rc.tm.cancel")}
          </Button>
        </div>
      ) : null}

      {panel === "pause" ? (
        <form
          className="flex flex-col gap-3 rounded-card bg-bg-subtle p-4"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            void run("pause", async () => {
              const r = await api.tiffin.pause(sub.id, { until });
              setPanel(null);
              return t("rc.tm.paused", { date: date(dayDate(r.resumesOn), { month: "short", day: "numeric" }, "UTC") });
            });
          }}
        >
          <Heading level={3}>{t("rc.tm.pauseTitle")}</Heading>
          <TextField type="date" label={t("rc.tm.pauseUntil")} value={until} min={addDays(todayIso(), 2)} onChange={(e) => setUntil(e.target.value)} required />
          <Button type="submit" loading={busy === "pause"}>
            {t("rc.tm.pauseConfirm")}
          </Button>
        </form>
      ) : null}

      {panel === "address" ? (
        <form
          className="flex flex-col gap-3 rounded-card bg-bg-subtle p-4"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            void run("address", async () => {
              await api.tiffin.update(sub.id, { address: address.trim(), postalCode: postal.trim(), addressNotes: notes.trim() || null });
              setPanel(null);
              return t("rc.tm.addressSaved");
            });
          }}
        >
          <TextField label={t("rc.tm.address")} value={address} onChange={(e) => setAddress(e.target.value)} minLength={3} maxLength={300} required autoComplete="street-address" />
          <TextField label={t("rc.tf.postal")} dir="ltr" value={postal} onChange={(e) => setPostal(e.target.value.toUpperCase())} minLength={3} maxLength={10} required autoComplete="postal-code" className="max-w-40" />
          <TextField type="textarea" label={`${t("rc.tf.addressNotes")} (${t("rc.optional")})`} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} rows={2} />
          <Button type="submit" loading={busy === "address"}>
            {t("rc.tm.saveAddress")}
          </Button>
        </form>
      ) : null}

      {panel === "cancel" ? (
        <div className="flex flex-col gap-3 rounded-card bg-bg-subtle p-4">
          <Heading level={3}>{t("rc.tm.cancelAsk")}</Heading>
          <p className="text-meta text-fg-muted">{t("rc.tm.cancelBody")}</p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setPanel(null)}>
              {t("rc.tm.cancelKeep")}
            </Button>
            <Button
              variant="danger"
              loading={busy === "cancel"}
              onClick={() =>
                run("cancel", async () => {
                  await api.tiffin.cancel(sub.id);
                  setPanel(null);
                  return t("rc.tm.cancelDone");
                })
              }
            >
              {t("rc.tm.cancelYes")}
            </Button>
          </div>
        </div>
      ) : null}

      <div className="border-t border-line pt-3">
        <button type="button" onClick={toggleCharges} aria-expanded={panel === "charges"} className="text-meta-strong text-fg underline-offset-4 hover:underline focus-visible:focus-ring">
          {panel === "charges" ? t("rc.tm.hide") : `${t("rc.tm.charges")} · ${t("rc.tm.details")}`}
        </button>
        {panel === "charges" ? (
          charges === null ? (
            <Skeleton className="mt-3 h-12 w-full" />
          ) : charges.length === 0 ? (
            <p className="mt-2 text-meta text-fg-muted">{t("rc.tm.noCharges")}</p>
          ) : (
            <ul className="mt-2">
              {charges.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 border-t border-line py-2.5 first:border-t-0">
                  <div className="min-w-0">
                    <p className="text-body tabular-nums text-fg">{money(c.amountCents - c.creditCents)}</p>
                    <p className="text-meta text-fg-muted">{t("rc.tm.chargePeriod", { from: date(dayDate(c.periodStart), { month: "short", day: "numeric" }, "UTC"), to: date(dayDate(c.periodEnd), { month: "short", day: "numeric" }, "UTC") })}</p>
                  </div>
                  <Pill>{chargeStatus[c.status]}</Pill>
                </li>
              ))}
            </ul>
          )
        ) : null}
        {sub.address && sub.fulfilment === "delivery" && !cancelled ? (
          <p className="mt-3 text-meta text-fg-muted">
            {t("rc.tm.address")}: {sub.address}
            {sub.postalCode ? `, ${sub.postalCode}` : ""}
          </p>
        ) : null}
      </div>
    </article>
  );
}
