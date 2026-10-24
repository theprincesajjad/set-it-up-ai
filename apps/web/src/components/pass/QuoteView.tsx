"use client";
import { CircleCheck, Phone } from "lucide-react";
import { useState } from "react";
import type { MessageKey, serviceApi } from "@ll/shared";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { ShopLogo } from "@/components/ui/ShopTile";
import { TextField } from "@/components/ui/TextField";
import { Timeline, ticketSteps } from "@/components/ui/Timeline";
import { BigNumber, FactList, Heading, Section, useFmt } from "@/components/restaurant/ui";
import { browserApi } from "@/lib/api/browser";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { cn } from "@/lib/cn";
import { PaymentBox, pollUntil } from "./PaymentBox";

const TZ = "America/Toronto";
const STEP_KEYS = ["intake", "diagnosing", "quote_sent", "approved", "declined", "in_progress", "waiting_parts", "ready", "picked_up", "cancelled"] as const;

function itemTitle(t: serviceApi.PublicQuoteResponse["ticket"]) {
  const d = t.itemDetails ?? {};
  const item = [d.make, d.model].filter(Boolean).join(" ");
  return item || t.issue;
}

/**
 * /q/<token>: review, e-sign (typed name) or decline, then pay the deposit if one is due. Repair quotes show what we
 * found, the credited fee, the price cap and the deposit; event quotes (bridal) show the day's facts and a deposit that
 * holds the date. In English, Hindi, Urdu and Punjabi, with the cap line in every one.
 */
export function QuoteView({ token, initial, preview = false }: { token: string; initial: serviceApi.PublicQuoteResponse; preview?: boolean }) {
  const { t, moneyExact: money, date, number, percent, locale } = useFmt();
  const [data, setData] = useState(initial);
  const [deposit, setDeposit] = useState<serviceApi.DepositPaymentDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [resuming, setResuming] = useState(false);
  const [name, setName] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState<"approve" | "decline" | null>(null);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [otherReason, setOtherReason] = useState("");
  const shop = data.merchant;
  const q = data.quote;
  const ev = data.event;
  const status = data.expired && q.status === "sent" ? "expired" : q.status;
  const nameOk = name.trim().length >= 2;
  const depositPaid = !!q.depositPaidAt;
  const shopName = shop.name;
  const day = (d: string) => date(new Date(`${d}T12:00:00Z`), { weekday: "short", month: "short", day: "numeric" }, "UTC");
  const eventKey = (ev?.type ?? "") as string;
  const eventWord = t((["bridal", "wedding"].includes(eventKey) ? `sv.q.type.${eventKey}` : "sv.q.type.event") as MessageKey);
  const pct = q.totalCents > 0 && q.depositCents > 0 ? Math.round((q.depositCents / q.totalCents) * 100) : 0;

  async function reload() {
    const fresh = await browserApi.public.quote(token, { preview });
    setData(fresh);
    return fresh;
  }

  async function approve() {
    setTouched(true);
    if (!nameOk) return;
    setBusy("approve");
    setError(null);
    try {
      const r = await browserApi.public.approveQuote(token, name.trim());
      setDeposit(r.deposit);
      await reload();
      setNotice(r.deposit ? null : t(ev ? "sv.q.noticeEvent" : "sv.q.noticeApproved", { shop: shopName }));
    } catch (e) {
      if (isApiError(e) && e.status === 409) await reload().catch(() => undefined);
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function decline() {
    setBusy("decline");
    setError(null);
    try {
      const r = reason === "other" ? otherReason.trim() || t("sv.q.reason.other") : reason ? t(`sv.q.reason.${reason}` as MessageKey) : undefined;
      await browserApi.public.declineQuote(token, r);
      await reload();
      setNotice(t("sv.q.noticeDeclined", { shop: shopName }));
      setDeclineOpen(false);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function resumeDeposit() {
    setResuming(true);
    try {
      const r = await browserApi.public.quoteDeposit(token);
      setDeposit(r.deposit);
      if (!r.deposit) await reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setResuming(false);
    }
  }

  async function paid() {
    const ok = await pollUntil(async () => !!(await reload()).quote.depositPaidAt);
    setDeposit(null);
    setNotice(ok ? t(ev ? "sv.q.noticeEvent" : "sv.q.noticeApproved", { shop: shopName }) : t("sv.q.noticePaid"));
  }

  const stepLabels = Object.fromEntries(STEP_KEYS.map((k) => [k, t(`sv.step.${k}` as MessageKey)]));
  const showForm = data.canRespond;
  const approveLabel = q.depositCents > 0 ? t("sv.q.approvePay", { amount: money(q.depositCents) }) : t("sv.q.approve");
  const a = q.authorizedBy;

  return (
    <div className="flex flex-col gap-6">
      {preview ? <Banner tone="info">Preview: this is what the customer sees. Opening it does not mark the quote as opened.</Banner> : null}
      <header className="flex items-center gap-3">
        <ShopLogo shop={{ name: shopName, vertical: shop.vertical, logoUrl: shop.logoUrl }} size={44} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-body-strong text-fg"><bdi>{shopName}</bdi></p>
          <p className="truncate text-meta text-fg-muted">{ev ? t("sv.q.kickerEvent", { n: data.ticket.number }) : t("sv.q.kicker", { n: data.ticket.number, item: itemTitle(data.ticket) })}</p>
        </div>
      </header>
      <Heading>{ev ? t("sv.q.titleEvent", { event: eventWord }) : t("sv.q.title")}</Heading>

      {notice ? <Banner tone="success" icon={CircleCheck}>{notice}</Banner> : null}
      {status === "approved" ? (
        <Banner tone="success" title={a?.method === "phone" ? t("sv.q.approvedPhone", { name: a.name, when: date(a.at, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }, TZ) }) : t("sv.q.approvedBy", { when: q.respondedAt ? date(q.respondedAt, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }, TZ) : "", name: q.signatureName ?? "" })} />
      ) : null}
      {status === "declined" ? <Banner tone="neutral" title={t("sv.q.declinedTitle")}>{t("sv.q.declinedBody", { shop: shopName })}</Banner> : null}
      {status === "expired" ? <Banner tone="neutral">{t("sv.q.expired", { date: q.expiresAt ? date(q.expiresAt, { month: "short", day: "numeric" }, TZ) : "", shop: shopName })}</Banner> : null}
      {status === "superseded" ? <Banner tone="info">{t("sv.q.superseded", { shop: shopName })}</Banner> : null}

      {ev ? (
        <Section title={t("sv.q.eventHeading")}>
          {q.diagnosis ? <p className="text-body text-fg-muted">{q.diagnosis}</p> : null}
          <FactList
            rows={[
              ...(ev.date ? [{ label: t("sv.q.eventDate"), value: day(ev.date) }] : []),
              ...(ev.start ? [{ label: t("sv.q.eventStart"), value: ev.start }] : []),
              ...(ev.where ? [{ label: t("sv.q.eventWhere"), value: ev.where }] : []),
              ...(ev.trial ? [{ label: t("sv.q.eventTrial"), value: ev.trial }] : []),
            ]}
          />
        </Section>
      ) : q.diagnosis ? (
        <Section plain title={t("sv.q.whatWeFound")}>
          <p className="text-body text-fg-muted">{q.diagnosis}</p>
        </Section>
      ) : null}

      <section aria-label={t("sv.q.title")} className="rounded-card border border-line px-4">
        <ul>
          {q.lineItems.map((l, i) => {
            const credit = l.totalCents < 0;
            const kindLabel = (x: typeof l, c: boolean) => { const k = c ? t("sv.q.credited") : x.kind === "part" || x.kind === "labour" || x.kind === "fee" ? t(`sv.q.kind.${x.kind}` as MessageKey) : ""; return k && x.description.toLowerCase().includes(k.toLowerCase()) ? "" : k; };
            return (
              <li key={i} className={cn("flex items-start justify-between gap-4 py-3", i > 0 && "border-t border-line")}>
                <div className="min-w-0">
                  <p className={cn("text-body", credit ? "text-positive-text" : "text-fg")}>{l.description}</p>
                  <p className="text-meta text-fg-muted">
                    {kindLabel(l, credit)}
                    {l.quantity > 1 ? `${credit || l.kind !== "other" ? " · " : ""}${number(l.quantity)} × ${money(l.unitPriceCents)}` : ""}
                  </p>
                </div>
                <p className={cn("shrink-0 text-body tabular-nums", credit ? "text-positive-text" : "text-fg")}>{money(l.totalCents)}</p>
              </li>
            );
          })}
        </ul>
        <dl className="border-t border-line py-3 text-meta">
          <div className="flex justify-between py-0.5"><dt className="text-fg-muted">{t("cart.subtotal")}</dt><dd className="tabular-nums">{money(q.subtotalCents)}</dd></div>
          {q.taxCents > 0 ? <div className="flex justify-between py-0.5"><dt className="text-fg-muted"><bdi>{data.taxLabel ?? "HST"}</bdi></dt><dd className="tabular-nums">{money(q.taxCents)}</dd></div> : null}
          <div className="flex justify-between pt-1 text-body-strong text-fg"><dt>{t("cart.total")}</dt><dd className="tabular-nums">{money(q.totalCents)}</dd></div>
        </dl>
      </section>

      {q.depositCents > 0 ? (
        <section className="flex flex-col gap-1 rounded-card bg-bg-subtle p-4" aria-label={t(ev ? "sv.q.depositHold" : "sv.q.depositNow", { pct: percent(pct) })}>
          <p className="text-meta text-fg-muted">{depositPaid ? t("sv.q.depositPaid") : t(ev ? "sv.q.depositHold" : "sv.q.depositNow", { pct: percent(pct) })}</p>
          <BigNumber tone={depositPaid ? "muted" : "fg"} className="text-[36px]">{money(q.depositCents)}</BigNumber>
          <p className="text-meta text-fg-muted">
            {ev
              ? ev.balanceDueOn
                ? t("sv.q.balanceDate", { amount: money(Math.max(0, q.totalCents - q.depositCents)), date: day(ev.balanceDueOn) })
                : t("sv.q.balanceOnly", { amount: money(Math.max(0, q.totalCents - q.depositCents)) })
              : t("sv.q.balancePickup", { amount: money(Math.max(0, q.totalCents - q.depositCents)) })}
            {!ev && data.promisedAt ? ` ${t("sv.q.readyBy", { date: date(data.promisedAt, { weekday: "short", month: "short", day: "numeric" }, TZ) })}` : ""}
          </p>
          {ev ? <p className="text-meta text-fg-muted">{t("sv.q.heldOnDeposit")}</p> : null}
        </section>
      ) : null}

      {ev ? <p className="text-meta text-fg-muted">{t("sv.q.changes", { shop: shopName })}</p> : <p className="text-meta text-fg-muted">{t("sv.q.cap", { amount: money(q.maxAuthorizedCents) })}</p>}

      {data.terms ? (
        <Section plain title={t("sv.q.terms", { shop: shopName })}>
          <p className="whitespace-pre-line text-meta text-fg-muted">{data.terms}</p>
        </Section>
      ) : null}

      {showForm ? (
        <form
          className="flex flex-col gap-3"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void approve();
          }}
        >
          <TextField label={t("rc.ca.signLabel")} hint={t("sv.q.signHelp")} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => setTouched(true)} error={touched && !nameOk ? t("rc.ca.signShort") : null} maxLength={120} required />
          {error ? <Banner tone="danger">{error}</Banner> : null}
          <Button type="submit" size="lg" fullWidth loading={busy === "approve"}>{approveLabel}</Button>
          <div className="grid grid-cols-2 gap-3">
            {shop.phone ? (
              <Button variant="secondary" size="lg" fullWidth iconStart={Phone} href={ev ? `sms:${shop.phone}` : `tel:${shop.phone}`}>{ev ? t("sv.q.message", { shop: shopName }) : t("sv.q.callShop")}</Button>
            ) : <span />}
            <Button type="button" variant="secondary" size="lg" fullWidth disabled={busy !== null} onClick={() => setDeclineOpen(true)}>{t("sv.q.decline")}</Button>
          </div>
          <p className="text-center text-meta text-fg-muted">
            {q.expiresAt ? `${t("sv.q.valid", { date: date(q.expiresAt, { month: "short", day: "numeric" }, TZ) })} ` : ""}
            {q.depositCents > 0 ? t("sv.q.payMethods") : ""}
          </p>
        </form>
      ) : shop.phone && status !== "approved" ? (
        <Button variant="secondary" size="lg" fullWidth iconStart={Phone} href={`tel:${shop.phone}`}>{t("rc.callShop", { shop: shopName })}</Button>
      ) : null}

      {deposit ? (
        <section aria-labelledby="deposit" className="flex flex-col gap-3">
          <h2 id="deposit" className="text-headline text-fg">{t("sv.q.payTitle", { amount: money(deposit.amountCents) })}</h2>
          <PaymentBox paymentIntentId={deposit.paymentIntentId} clientSecret={deposit.clientSecret} amountCents={deposit.amountCents} label={t("sv.q.pay", { amount: money(deposit.amountCents) })} onPaid={paid} />
        </section>
      ) : q.status === "approved" && q.depositCents > 0 && !depositPaid && data.depositDue ? (
        <Button size="lg" fullWidth loading={resuming} onClick={resumeDeposit}>{t("sv.q.pay", { amount: money(q.depositCents) })}</Button>
      ) : null}
      {q.status === "approved" && depositPaid ? <Banner tone="success">{t("sv.q.depositPaidBanner", { amount: money(q.depositCents) })}</Banner> : null}

      {!ev && (q.status === "approved" || q.status === "declined") ? (
        <section aria-labelledby="progress" className="rounded-card border border-line p-4">
          <h2 id="progress" className="mb-4 text-headline text-fg">{t("sv.q.progress")}</h2>
          <Timeline steps={ticketSteps(data.ticket.status, stepLabels)} label={t("sv.q.progress")} />
        </section>
      ) : null}

      <Modal
        open={declineOpen}
        onClose={() => setDeclineOpen(false)}
        title={t("sv.q.declineTitle")}
        description={t("sv.q.declineBody", { shop: shopName })}
        actions={
          <>
            <Button variant="secondary" onClick={() => setDeclineOpen(false)}>{t("sv.q.keep")}</Button>
            <Button variant="danger" loading={busy === "decline"} onClick={decline}>{t("sv.q.declineGo")}</Button>
          </>
        }
      >
        <div className="flex flex-col gap-3" dir={locale === "ur" ? "rtl" : undefined}>
          <Select label={t("sv.q.reason")} placeholder={t("sv.q.reasonPick")} value={reason} onChange={(e) => setReason(e.target.value)} options={(["expensive", "elsewhere", "notWorth", "other"] as const).map((r) => ({ value: r, label: t(`sv.q.reason.${r}` as MessageKey) }))} />
          {reason === "other" ? <TextField label={t("sv.q.reasonMore")} optionalLabel value={otherReason} onChange={(e) => setOtherReason(e.target.value)} maxLength={300} /> : null}
        </div>
      </Modal>
    </div>
  );
}
