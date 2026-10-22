"use client";
import { CalendarCheck } from "lucide-react";
import { useState } from "react";
import type { restaurantApi } from "@ll/shared";
import { PaymentBox, pollUntil } from "@/components/pass/PaymentBox";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { browserClient } from "@/lib/api/browser";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { restaurantCustomerApi } from "@/lib/restaurant/api";
import { dayDate, eventLabel, serviceLabel } from "@/lib/restaurant/util";
import { BigNumber, FactList, Heading, Section, ShopHead, useFmt } from "./ui";

const api = restaurantCustomerApi(browserClient);

type Payment = { paymentIntentId: string; clientSecret: string; amountCents: number };

/** /e/<token>: review a catering quote, sign with a typed name, then pay the deposit. */
export function CateringApproval({ token, initial }: { token: string; initial: restaurantApi.PublicCateringResponse }) {
  const { t, money, date, time, number, percent } = useFmt();
  const [data, setData] = useState(initial);
  const [signature, setSignature] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payment, setPayment] = useState<Payment | null>(null);
  const [offline, setOffline] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const { merchant: shop, event: e } = data;

  const dayLabel = date(dayDate(e.eventDate), { weekday: "long", month: "long", day: "numeric", year: "numeric" }, "UTC");
  const whenLabel = e.startTime ? t("rc.ca.when", { date: dayLabel, time: time(new Date(`${e.eventDate}T${e.startTime}:00Z`), "UTC") }) : dayLabel;
  const typeLabel = eventLabel(t, e.eventType);
  const depositPct = Math.round(e.depositBps / 100);
  const hasDeposit = e.depositCents > 0;
  const signatureOk = signature.trim().length >= 2;

  async function reload() {
    const fresh = await api.catering.view(token);
    setData(fresh);
    return fresh;
  }

  /** Approve (idempotent on the server) and take whatever deposit payment comes back. */
  async function approve(name: string) {
    setBusy(true);
    setError(null);
    try {
      const r = await api.catering.approve(token, name.trim());
      setData((d) => ({ ...d, event: r.event, canApprove: false, depositDue: r.event.status === "quoted" && r.event.depositCents > 0 && !r.event.depositPaidAt }));
      if (r.deposit?.clientSecret) {
        setPayment({ paymentIntentId: r.deposit.paymentIntentId, clientSecret: r.deposit.clientSecret, amountCents: r.deposit.amountCents });
      } else if (r.event.status === "quoted" && r.event.depositCents > 0 && !r.event.depositPaidAt) {
        setOffline(true);
      }
    } catch (err) {
      if (isApiError(err) && err.status === 404) setError(t("rc.ca.goneBody"));
      else setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setTouched(true);
    if (!signatureOk) return;
    void approve(signature);
  }

  async function paid() {
    setConfirming(true);
    await pollUntil(async () => (await reload()).event.status === "confirmed");
    setPayment(null);
    setConfirming(false);
  }

  const status = e.status;
  const approved = !!e.approvedAt;
  const confirmed = status === "confirmed" || status === "completed";
  const showForm = data.canApprove && !approved;
  const owes = !confirmed && status === "quoted" && approved && hasDeposit && !e.depositPaidAt;

  // Menu lines: strip the API's English "(per guest)" / "(tray)" suffix and show the maths in the viewer's language.
  const lines = e.lineItems.map((l) => {
    const perGuest = /\s\(per guest\)$/.test(l.description);
    const tray = /\s\(tray\)$/.test(l.description);
    const name = l.description.replace(/\s\((per guest|tray)\)$/, "");
    const detail = perGuest ? t("rc.ca.perGuestLine", { n: number(l.quantity), price: money(l.unitPriceCents) }) : tray ? t("rc.ca.trayLine", { n: l.quantity, price: money(l.unitPriceCents) }) : l.quantity > 1 ? t("rc.ca.qtyLine", { n: number(l.quantity), price: money(l.unitPriceCents) }) : null;
    return { name, detail, total: l.totalCents };
  });

  return (
    <div className="flex flex-col gap-6">
      <ShopHead shop={shop} kicker={t("rc.ca.quoteNo", { n: e.number })} href={`/shops/${encodeURIComponent(shop.slug)}`} />
      <Heading>{t("rc.ca.title")}</Heading>

      {status === "cancelled" ? <Banner tone="neutral">{t("rc.ca.cancelled", { shop: shop.name })}</Banner> : null}
      {status === "completed" ? <Banner tone="success">{t("rc.ca.completed", { shop: shop.name.replace(/\.$/, "") })}</Banner> : null}
      {confirming ? (
        <Banner tone="info" title={t("rc.ca.processing")}>
          {t("rc.ca.processingBody")}
        </Banner>
      ) : null}
      {status === "confirmed" && !confirming ? (
        <section className="flex flex-col gap-2 rounded-sheet bg-bg-subtle p-5" aria-label={t("rc.ca.confirmedTitle")}>
          <CalendarCheck aria-hidden className="size-7 text-accent-text" strokeWidth={1.5} />
          <Heading level={2}>{t("rc.ca.confirmedTitle")}</Heading>
          <p className="text-body text-fg">{t("rc.ca.confirmedBody", { shop: shop.name, type: typeLabel, date: dayLabel })}</p>
          <p className="text-meta text-fg-muted">{hasDeposit && e.depositPaidAt ? t("rc.ca.confirmedPaid", { amount: money(e.depositCents) }) : t("rc.ca.confirmedNoDeposit")}</p>
        </section>
      ) : null}
      {owes && !payment && !offline ? <Banner tone="info">{t("rc.ca.alreadyApproved", { date: date(e.approvedAt!, { month: "long", day: "numeric" }) })}</Banner> : null}

      <Section title={t("rc.ca.summary")}>
        <FactList
          rows={[
            { label: t("rc.ca.type"), value: typeLabel },
            { label: t("rc.ca.date"), value: whenLabel },
            { label: t("rc.ca.guests"), value: number(e.headcount) },
            ...(e.venueName || e.venueAddress ? [{ label: t("rc.ca.venue"), value: [e.venueName, e.venueAddress].filter(Boolean).join(", ") }] : []),
            { label: t("rc.ca.service"), value: serviceLabel(t, e.service) },
            ...(e.dietaryNotes ? [{ label: t("rc.ca.diet"), value: e.dietaryNotes }] : []),
          ]}
        />
      </Section>

      <Section title={t("rc.ca.menu")}>
        <div className="rounded-card border border-line px-4">
          <ul>
            {lines.map((l, i) => (
              <li key={i} className={`flex items-start justify-between gap-4 py-3 ${i > 0 ? "border-t border-line" : ""}`}>
                <div className="min-w-0">
                  <p className="text-body text-fg">{l.name}</p>
                  {l.detail ? <p className="text-meta text-fg-muted">{l.detail}</p> : null}
                </div>
                <p className="shrink-0 text-body tabular-nums text-fg">{money(l.total)}</p>
              </li>
            ))}
          </ul>
          <dl className="border-t border-line py-3 text-meta">
            <div className="flex justify-between py-0.5">
              <dt className="text-fg-muted">{t("rc.ca.subtotal")}</dt>
              <dd className="tabular-nums">{money(e.subtotalCents)}</dd>
            </div>
            <div className="flex justify-between py-0.5">
              <dt className="text-fg-muted">{t("rc.ca.tax")}</dt>
              <dd className="tabular-nums">{money(e.taxCents)}</dd>
            </div>
            <div className="flex justify-between pt-1 text-body-strong text-fg">
              <dt>{t("rc.ca.total")}</dt>
              <dd className="tabular-nums">{money(e.totalCents)}</dd>
            </div>
          </dl>
        </div>
        {e.perHeadCents > 0 ? <p className="text-meta text-fg-muted">{t("rc.ca.perGuest", { price: money(e.perHeadCents) })}</p> : null}
      </Section>

      {hasDeposit && status !== "cancelled" ? (
        <section className="flex flex-col gap-1" aria-label={t("rc.ca.depositDue", { pct: percent(depositPct) })}>
          <p className="text-meta text-fg-muted">{e.depositPaidAt ? t("rc.ca.depositPaid") : t("rc.ca.depositDue", { pct: percent(depositPct) })}</p>
          <BigNumber tone={e.depositPaidAt ? "muted" : "accent"}>{money(e.depositCents)}</BigNumber>
          <p className="text-meta text-fg-muted">
            {t("rc.ca.balance")}: {money(Math.max(0, e.totalCents - e.depositCents))}
          </p>
        </section>
      ) : null}

      {error ? <Banner tone="danger">{error}</Banner> : null}

      {showForm ? (
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <p className="text-meta text-fg-muted">{t("rc.ca.terms", { shop: shop.name })}</p>
          <TextField
            label={t("rc.ca.signLabel")}
            hint={t("rc.ca.signHint")}
            value={signature}
            onChange={(ev) => setSignature(ev.target.value)}
            onBlur={() => setTouched(true)}
            error={touched && !signatureOk ? t("rc.ca.signShort") : null}
            autoComplete="name"
            maxLength={120}
            required
          />
          <Button type="submit" size="lg" fullWidth loading={busy}>
            {hasDeposit ? t("rc.ca.approvePay", { amount: money(e.depositCents) }) : t("rc.ca.approve")}
          </Button>
        </form>
      ) : null}

      {payment ? (
        <Section title={t("rc.ca.payTitle")}>
          <Banner tone="success" title={t("rc.ca.approvedTitle")}>
            {t("rc.ca.approvedBody", { name: e.signatureName ?? signature.trim(), date: dayLabel })}
          </Banner>
          <PaymentBox paymentIntentId={payment.paymentIntentId} clientSecret={payment.clientSecret} amountCents={payment.amountCents} label={t("rc.ca.pay", { amount: money(payment.amountCents) })} onPaid={paid} />
        </Section>
      ) : null}

      {owes && !payment && !offline ? (
        <Button size="lg" fullWidth loading={busy} onClick={() => approve(e.signatureName ?? "")}>
          {t("rc.ca.resume", { amount: money(e.depositCents) })}
        </Button>
      ) : null}
      {offline ? (
        <Banner tone="info" title={t("rc.ca.approvedTitle")}>
          {t("rc.ca.payOffline", { shop: shop.name })}
        </Banner>
      ) : null}

      {shop.phone ? (
        <Button variant="secondary" fullWidth href={`tel:${shop.phone}`}>
          {t("rc.callShop", { shop: shop.name })}
        </Button>
      ) : null}
    </div>
  );
}
