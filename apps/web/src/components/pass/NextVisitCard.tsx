"use client";
import { CalendarClock, MapPin } from "lucide-react";
import type { appointmentsApi } from "@ll/shared";
import { useFmt } from "@/components/restaurant/ui";
import { Button } from "@/components/ui/Button";

/**
 * "Your next visit": when, with whom, where (with a directions link) and the shop's change and cancel policy in words.
 * Shown on the booking confirmation and at the top of the wallet, so a customer never needs the text message to find their booking.
 */
export function NextVisitCard({ appt, showManage = true }: { appt: appointmentsApi.MyAppointmentDto; showManage?: boolean }) {
  const { t, money, date, time } = useFmt();
  const when = `${date(appt.startsAt, { weekday: "long", month: "long", day: "numeric" })}, ${time(appt.startsAt)}`;
  const fee = Math.max(0, appt.policy.noShowFeeCents - (appt.depositPaidAt ? appt.depositCents : 0));
  const services = appt.items.map((i) => i.name).join(", ");
  const policy = fee > 0 ? t("bk.policy.fee", { hours: appt.policy.cancelWindowHours, fee: money(fee) }) : t("bk.policy.nofee", { hours: appt.policy.cancelWindowHours });
  const map = appt.merchant.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${appt.merchant.name} ${appt.merchant.address}`)}` : null;
  return (
    <section aria-label={t("bk.next.title")} data-testid="next-visit" className="flex flex-col gap-3 rounded-sheet border border-line p-5">
      <div className="flex items-start gap-3">
        <CalendarClock aria-hidden className="mt-0.5 size-5 shrink-0 text-fg" strokeWidth={1.5} />
        <div className="min-w-0">
          <p className="text-meta text-fg-muted">{t("bk.next.title")}</p>
          <p className="text-body-strong text-fg">{when}</p>
          <p className="text-meta text-fg-muted">
            <bdi>{appt.merchant.name}</bdi>
            {services ? ` · ${services}` : ""}
            {appt.petName ? ` · ${t("bk.next.for", { pet: appt.petName })}` : ""}
            {appt.staffName ? ` · ${appt.staffName}` : ""}
          </p>
        </div>
      </div>
      {appt.merchant.address ? (
        <div className="flex items-start gap-3">
          <MapPin aria-hidden className="mt-0.5 size-5 shrink-0 text-fg" strokeWidth={1.5} />
          <div className="min-w-0">
            <p className="text-body text-fg">{appt.merchant.address}</p>
            {map ? <a href={map} target="_blank" rel="noopener noreferrer" className="text-meta text-fg underline underline-offset-2">{t("bk.next.directions")}</a> : null}
          </div>
        </div>
      ) : null}
      <p className="text-meta text-fg-muted">{policy}</p>
      {showManage ? <Button variant="secondary" size="sm" className="self-start" href={`/shops/${encodeURIComponent(appt.merchant.slug)}/book/${appt.id}`}>{t("bk.done.manage")}</Button> : null}
    </section>
  );
}
