"use client";
import { MapPin, Phone } from "lucide-react";
import { useEffect, useState } from "react";
import type { MessageKey, serviceApi } from "@ll/shared";
import { Button } from "@/components/ui/Button";
import { Timeline, type TimelineStep } from "@/components/ui/Timeline";
import { BigNumber, Heading, useFmt } from "@/components/restaurant/ui";
import { browserApi } from "@/lib/api/browser";

const TZ = "America/Toronto";

/** /t/<token>: where is my repair. One big status word, pay now when something is owed, the progress with times, warranty, call and directions. */
export function TicketStatusView({ token, initial }: { token: string; initial: serviceApi.PublicTicketStatusResponse }) {
  const { t, money, date, locale } = useFmt();
  const [data, setData] = useState(initial);
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void browserApi.public.ticketStatus(token).then(setData, () => undefined);
    }, 30_000);
    return () => clearInterval(id);
  }, [token]);
  const { merchant: shop, ticket: tk, invoice: inv, quote } = data;
  const stamp = (iso: string) => date(iso, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }, TZ);
  const steps: TimelineStep[] = data.events.map((e, i, all) => ({
    id: `${i}`,
    label: e.status ? t(`sv.step.${e.status}` as MessageKey) : (e.note ?? ""),
    state: i === all.length - 1 && tk.status !== "picked_up" ? "current" : "done",
    at: null,
    note: <span className="text-fg-muted">{stamp(e.createdAt)}</span>,
  }));
  const owes = inv?.status === "open" && inv.amountDueCents > 0;
  const lang = locale === "en" ? "" : `?lang=${locale}`;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <p className="text-meta text-fg-muted"><bdi>{t("sv.t.kicker", { shop: shop.name, n: tk.number })}</bdi></p>
        <Heading>{t(`sv.step.${tk.status}` as MessageKey)}</Heading>
        <p className="text-body text-fg-muted">{tk.itemLabel}, {tk.issue}.{tk.promisedAt && tk.status !== "ready" && tk.status !== "picked_up" ? ` ${t("sv.t.promised", { date: date(tk.promisedAt, { weekday: "short", month: "short", day: "numeric" }, TZ) })}` : ""}</p>
      </div>

      {quote?.approvalUrl && tk.status === "quote_sent" ? (
        <section className="flex flex-col gap-3 rounded-card border border-line p-4">
          <p className="text-body text-fg">{t("sv.t.quoteWaiting")}</p>
          <Button size="lg" fullWidth href={`${new URL(quote.approvalUrl).pathname}${lang}`}>{t("sv.t.reviewQuote")}</Button>
        </section>
      ) : null}

      {owes && inv ? (
        <section className="flex flex-col gap-3 rounded-card border border-line p-4" aria-label={t("sv.t.balance")}>
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-meta text-fg-muted">{t("sv.t.balance")}</p>
              <BigNumber className="text-[36px]">{money(inv.amountDueCents)}</BigNumber>
            </div>
            {inv.depositAppliedCents > 0 ? <p className="text-meta text-fg-muted">{t("sv.t.depositPaid", { amount: money(inv.depositAppliedCents) })}</p> : null}
          </div>
          {inv.payUrl ? <Button size="lg" fullWidth href={`${new URL(inv.payUrl).pathname}${lang}`}>{t("sv.t.payNow", { amount: money(inv.amountDueCents) })}</Button> : null}
          <p className="text-meta text-fg-muted">{t("sv.t.orCounter")}</p>
        </section>
      ) : null}
      {inv?.status === "paid" ? <p className="rounded-card bg-bg-subtle p-4 text-body text-fg">{t("sv.t.paidTitle")}</p> : null}

      <section aria-labelledby="progress" className="flex flex-col gap-3">
        <h2 id="progress" className="text-headline text-fg">{t("sv.t.progress")}</h2>
        <Timeline steps={steps} label={t("sv.t.progress")} />
      </section>

      {data.warrantyDays && (tk.status === "ready" || tk.status === "picked_up") ? (
        <section className="rounded-card bg-bg-subtle p-4">
          <p className="text-body-strong text-fg">{t("sv.t.warrantyTitle", { days: data.warrantyDays })}</p>
          <p className="mt-0.5 text-meta text-fg-muted">{t("sv.t.warrantyBody", { shop: shop.name })}</p>
        </section>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        {shop.phone ? <Button variant="secondary" size="lg" fullWidth iconStart={Phone} href={`tel:${shop.phone}`}>{t("shop.call")}</Button> : <span />}
        {shop.mapUrl ? <Button variant="secondary" size="lg" fullWidth iconStart={MapPin} href={shop.mapUrl}>{t("shop.directions")}</Button> : <span />}
      </div>
    </div>
  );
}
