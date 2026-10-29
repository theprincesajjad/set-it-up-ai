"use client";
/**
 * The "Take it" page body (phase-pro P2): the shop, the slot and one button. Taken: "It's yours". Lapsed or taken by someone else:
 * "That spot was taken" with a way back to the booking page.
 */
import { CalendarX2, CircleCheck } from "lucide-react";
import { useState } from "react";
import type { waitlistApi } from "@ll/shared";
import { Heading, ShopHead, useFmt } from "@/components/restaurant/ui";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { browserClient } from "@/lib/api/browser";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { publicWaitlistEndpoints } from "@/lib/api/waitlist";

const api = publicWaitlistEndpoints(browserClient);

export function TakeOffer({ token, initial }: { token: string; initial: waitlistApi.OfferDto | null }) {
  const { t, date, time, money } = useFmt();
  const [offer, setOffer] = useState(initial);
  const [booked, setBooked] = useState<string | null>(initial?.state === "booked" ? initial.appointmentId : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const gone = !offer || (offer.state !== "open" && offer.state !== "booked" && !booked);

  if (gone)
    return (
      <EmptyState
        icon={CalendarX2}
        title={t("wl.take.gone")}
        description={t("wl.take.goneBody")}
        action={offer ? <Button href={`/shops/${encodeURIComponent(offer.merchant.slug)}/book`}>{t("wl.take.pickTime")}</Button> : <Button variant="secondary" href="/me">{t("wl.take.myCard")}</Button>}
      />
    );

  const tz = offer.merchant.timezone;
  const when = `${date(offer.startsAt, { weekday: "long", month: "long", day: "numeric" }, tz)}, ${time(offer.startsAt, tz)}`;
  const head = <ShopHead shop={offer.merchant} href={`/shops/${encodeURIComponent(offer.merchant.slug)}`} />;

  async function take() {
    setBusy(true);
    setError(null);
    try {
      const r = await api.take(token);
      setBooked(r.appointmentId);
    } catch (e) {
      if (isApiError(e) && (e.status === 410 || e.status === 404)) setOffer((o) => (o ? { ...o, state: "taken" } : o));
      else setError(isApiError(e) && e.isNetwork ? t("rc.error.body") : errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (booked)
    return (
      <div className="flex flex-col gap-6" data-testid="wl-taken">
        {head}
        <section className="flex flex-col gap-3 rounded-sheet bg-bg-subtle p-5" aria-label={t("wl.take.booked")}>
          <CircleCheck aria-hidden className="size-7 text-positive" strokeWidth={1.5} />
          <Heading level={2}>{t("wl.take.booked")}</Heading>
          <p className="text-body text-fg-muted">{t("wl.take.bookedBody", { shop: offer.merchant.name, when, service: offer.serviceName })}</p>
        </section>
        <div className="flex flex-col gap-3">
          <Button size="lg" fullWidth href={`/shops/${encodeURIComponent(offer.merchant.slug)}/book/${booked}`}>{t("wl.take.manage")}</Button>
          <Button size="lg" variant="ghost" fullWidth href={`/shops/${encodeURIComponent(offer.merchant.slug)}`}>{t("rc.backToShop", { shop: offer.merchant.name })}</Button>
        </div>
      </div>
    );

  return (
    <div className="flex flex-col gap-6" data-testid="wl-offer">
      {head}
      <div className="flex flex-col gap-2">
        <Heading>{t("wl.take.title")}</Heading>
        {offer.expiresAt ? <p className="text-body text-fg-muted">{t("wl.take.until", { time: time(offer.expiresAt, tz) })}</p> : null}
      </div>
      <section className="flex flex-col gap-1 rounded-card border border-line p-4" aria-label={t("wl.take.slot")}>
        <p className="text-title text-fg">{when}</p>
        <p className="text-body text-fg">{offer.serviceName}{offer.staffName ? ` · ${offer.staffName}` : ""}</p>
        {offer.priceCents > 0 ? <p className="text-meta tabular-nums text-fg-muted">{money(offer.priceCents)}</p> : null}
      </section>
      {error ? <Banner tone="danger">{error}</Banner> : null}
      <Button size="lg" fullWidth loading={busy} onClick={() => void take()}>{t("wl.take.cta")}</Button>
      <p className="text-meta text-fg-muted">{t("wl.take.note", { shop: offer.merchant.name })}</p>
    </div>
  );
}
