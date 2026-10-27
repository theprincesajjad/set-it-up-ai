"use client";
import { CircleCheck } from "lucide-react";
import { useState, type FormEvent } from "react";
import { restaurantApi } from "@ll/shared";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { TextField } from "@/components/ui/TextField";
import { browserClient } from "@/lib/api/browser";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { formatNanp, normalizeDigits, toE164, validateNanp } from "@/lib/phone";
import { restaurantCustomerApi, type CateringInquiryReceipt } from "@/lib/restaurant/api";
import { dayDate, eventLabel, serviceLabel, todayIso } from "@/lib/restaurant/util";
import { BigNumber, FieldLabel, Heading, Section, ShopHead, useFmt } from "./ui";

const api = restaurantCustomerApi(browserClient);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Shop = { name: string; slug: string; logoUrl: string | null; brandColor: string | null; phone: string | null };
type Errors = Partial<Record<"name" | "phone" | "email" | "date" | "guests", string>>;

/** Public catering inquiry (restaurant-endpoints.md: POST /public/shops/:slug/catering/inquiries). Also used by banquet with service=banquet. */
export function CateringInquiryForm({ shop, fromPerGuestCents = null }: { shop: Shop; /** The cheapest tray priced per guest it serves; null when the menu has none. */ fromPerGuestCents?: number | null }) {
  const { t, date, money } = useFmt();
  const [eventType, setEventType] = useState<restaurantApi.CateringEventType>("wedding");
  const [service, setService] = useState<restaurantApi.CateringService>("delivery");
  const [eventDate, setEventDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [guests, setGuests] = useState("");
  const [venueName, setVenueName] = useState("");
  const [venueAddress, setVenueAddress] = useState("");
  const [diet, setDiet] = useState("");
  const [notes, setNotes] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<{ tone: "danger" | "info"; text: string } | null>(null);
  const [done, setDone] = useState<{ receipt: CateringInquiryReceipt; name: string; phone: string; summary: string } | null>(null);

  function validate(): Errors {
    const e: Errors = {};
    if (name.trim().length < 2) e.name = t("rc.cq.errName");
    if (validateNanp(normalizeDigits(phone)) !== "ok") e.phone = t("rc.cq.errPhone");
    if (!eventDate) e.date = t("rc.cq.errDate");
    const n = Number(guests);
    if (!Number.isInteger(n) || n < 1 || n > 5000) e.guests = t("rc.cq.errGuests");
    if (email.trim() && !EMAIL.test(email.trim())) e.email = t("rc.cq.errEmail");
    return e;
  }

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    const e = validate();
    setErrors(e);
    setBanner(null);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      const receipt = await api.catering.inquire(shop.slug, {
        eventType,
        eventDate,
        startTime: startTime || null,
        headcount: Number(guests),
        service,
        venueName: venueName.trim() || null,
        venueAddress: venueAddress.trim() || null,
        dietaryNotes: diet.trim() || null,
        notes: notes.trim() || null,
        name: name.trim(),
        phone: toE164(phone) ?? phone,
        email: email.trim() || null,
      });
      const summary = t("rc.cq.summary", { type: eventLabel(t, eventType), n: Number(guests), date: date(dayDate(eventDate), { weekday: "short", month: "long", day: "numeric", year: "numeric" }, "UTC") });
      setDone({ receipt, name: name.trim(), phone: formatNanp(normalizeDigits(phone)), summary });
      window.scrollTo?.({ top: 0 });
    } catch (err) {
      if (isApiError(err) && err.status === 402) setBanner({ tone: "info", text: t("rc.cq.unavailable", { shop: shop.name }) });
      else setBanner({ tone: "danger", text: isApiError(err) && err.isNetwork ? t("rc.error.body") : isApiError(err) && err.status >= 500 ? t("rc.error.generic") : errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="flex flex-col gap-6">
        <ShopHead shop={shop} href={`/shops/${encodeURIComponent(shop.slug)}`} />
        <section className="flex flex-col gap-3 rounded-sheet bg-bg-subtle p-5" aria-label={t("rc.cq.sentTitle")}>
          <CircleCheck aria-hidden className="size-7 text-positive" strokeWidth={1.5} />
          <Heading level={2}>{t("rc.cq.sentTitle")}</Heading>
          <div>
            <BigNumber className="text-[32px]">{t("rc.cq.ref", { n: done.receipt.number })}</BigNumber>
          </div>
          <p className="text-body text-fg">{done.summary}</p>
          <p className="text-body text-fg-muted">{t("rc.cq.sentBody", { name: done.name, shop: shop.name, phone: done.phone })}</p>
          {shop.phone ? <p className="text-meta text-fg-muted">{t("tcb2.cq.followUp", { shop: shop.name, phone: shop.phone, n: done.receipt.number })}</p> : null}
        </section>
        <div className="flex flex-col gap-2">
          <Button size="lg" fullWidth href={`/shops/${encodeURIComponent(shop.slug)}`}>
            {t("rc.backToShop", { shop: shop.name })}
          </Button>
          <Button variant="secondary" fullWidth onClick={() => setDone(null)}>
            {t("rc.cq.another")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-6">
      <ShopHead shop={shop} href={`/shops/${encodeURIComponent(shop.slug)}`} />
      <div className="flex flex-col gap-2">
        <Heading>{t("catering.title")}</Heading>
        <p className="text-body text-fg-muted">{t("rc.cq.intro", { shop: shop.name })}</p>
        {fromPerGuestCents ? <p className="text-meta-strong text-fg">{t("tcb2.cq.from", { price: money(fromPerGuestCents) })}</p> : null}
      </div>

      <div className="flex flex-col gap-2">
        <FieldLabel id="cq-type">{t("catering.eventType")}</FieldLabel>
        <div role="group" aria-labelledby="cq-type" className="flex flex-wrap gap-2">
          {restaurantApi.CATERING_EVENT_TYPES.map((k) => (
            <Chip key={k} selected={eventType === k} onClick={() => setEventType(k)}>
              {eventLabel(t, k)}
            </Chip>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2">
        <TextField type="date" label={t("catering.eventDate")} value={eventDate} min={todayIso()} onChange={(e) => setEventDate(e.target.value)} error={errors.date} required />
        <TextField type="time" label={`${t("rc.cq.time")} (${t("rc.optional")})`} value={startTime} onChange={(e) => setStartTime(e.target.value)} />
      </div>
      <TextField type="number" inputMode="numeric" min={1} max={5000} label={t("catering.guests")} value={guests} onChange={(e) => setGuests(e.target.value)} error={errors.guests} required />

      <div className="flex flex-col gap-2">
        <FieldLabel id="cq-service">{t("rc.cq.service")}</FieldLabel>
        <div role="group" aria-labelledby="cq-service" className="flex flex-wrap gap-2">
          {restaurantApi.CATERING_SERVICES.map((k) => (
            <Chip key={k} selected={service === k} onClick={() => setService(k)}>
              {serviceLabel(t, k)}
            </Chip>
          ))}
        </div>
      </div>

      <TextField label={`${t("rc.cq.venueName")} (${t("rc.optional")})`} value={venueName} onChange={(e) => setVenueName(e.target.value)} maxLength={200} autoComplete="off" />
      <TextField label={`${t("rc.cq.venueAddress")} (${t("rc.optional")})`} value={venueAddress} onChange={(e) => setVenueAddress(e.target.value)} maxLength={400} autoComplete="street-address" />
      <TextField type="textarea" label={`${t("rc.cq.diet")} (${t("rc.optional")})`} hint={t("rc.cq.dietHint")} value={diet} onChange={(e) => setDiet(e.target.value)} maxLength={2000} rows={3} />
      <TextField type="textarea" label={`${t("catering.message")} (${t("rc.optional")})`} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={4000} rows={3} />

      <Section title={t("rc.cq.about")}>
        <TextField label={t("catering.name")} value={name} onChange={(e) => setName(e.target.value)} error={errors.name} autoComplete="name" maxLength={120} required />
        <TextField type="tel" inputMode="tel" dir="ltr" label={t("catering.phone")} value={phone} onChange={(e) => setPhone(formatNanp(normalizeDigits(e.target.value)))} error={errors.phone} autoComplete="tel-national" placeholder="(416) 555-0123" required />
        <TextField type="email" dir="ltr" label={`${t("catering.email")} (${t("rc.optional")})`} value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} autoComplete="email" maxLength={200} />
      </Section>

      {banner ? <Banner tone={banner.tone}>{banner.text}</Banner> : null}
      {Object.keys(errors).length ? <p role="alert" className="sr-only">{Object.values(errors).join(" ")}</p> : null}
      <div className="flex flex-col gap-3">
        <Button type="submit" size="lg" fullWidth loading={busy}>
          {t("catering.submit")}
        </Button>
        <p className="text-center text-meta text-fg-muted">{t("rc.cq.privacy")}</p>
        {shop.phone ? (
          <Button variant="secondary" fullWidth href={`tel:${shop.phone}`}>
            {t("rc.callShop", { shop: shop.name })}
          </Button>
        ) : null}
      </div>
    </form>
  );
}
