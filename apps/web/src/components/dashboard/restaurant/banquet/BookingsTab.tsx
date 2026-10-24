"use client";
import { ExternalLink, Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { restaurantApi } from "@ll/shared";
import { Capsules, DefList, Dot, EmptyState, Section, SidePanel as Sheet, type DotTone } from "@/components/dashboard/kit";
import { useSearchParams } from "next/navigation";
import { RecordPaymentPanel } from "../RecordPaymentPanel";
import { ConfirmDialog } from "@/components/dashboard/ConfirmDialog";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { PaymentBox } from "@/components/pass/PaymentBox";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Select } from "@/components/ui/Select";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { formatDateTime, formatMoney, formatNumber, formatTime } from "@/lib/format";
import { useAction, useApi } from "@/lib/dashboard/useApi";
import { EVENT_TYPE_LABEL, EVENT_TYPE_OPTIONS } from "../catering/labels";
import { NO_REFUND, RefundChoice, refundBody, refundedText, type RefundState } from "../RefundChoice";
import { FormGrid, Loader, NumberField, addDaysISO, bpsToPct, dayLabel, todayISO, torontoDay, torontoInstant } from "../common";
import { BOOKING_LABEL, BOOKING_ORDER } from "./labels";

type Gate = { featureKey: "restaurant.banquet"; title: string; what: string };
type Booking = restaurantApi.HallBookingDto;
type Filter = "all" | restaurantApi.HallBookingStatus;
const TONE: Record<restaurantApi.HallBookingStatus, DotTone> = { hold: "info", confirmed: "positive", completed: "neutral", cancelled: "neutral" };

/** Time left on a hold, ticking each 30 seconds. */
export function useHoldLeft(expiresAt: string | null): { text: string; lapsed: boolean; urgent: boolean } | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!expiresAt) return;
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, [expiresAt]);
  if (!expiresAt) return null;
  const ms = new Date(expiresAt).getTime() - now;
  if (ms <= 0) return { text: "Hold lapsed", lapsed: true, urgent: false };
  const mins = Math.floor(ms / 60_000);
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const text = d ? `${d} d ${h} h left` : h ? `${h} h ${mins % 60} min left` : `${mins} min left`;
  return { text, lapsed: false, urgent: ms < 6 * 3_600_000 };
}

function HoldLeft({ b }: { b: Booking }) {
  const left = useHoldLeft(b.status === "hold" ? b.holdExpiresAt : null);
  if (!left) return null;
  return <span className={left.lapsed || left.urgent ? "text-negative" : "text-fg-muted"}>{left.text}</span>;
}
/** "100% back 30+ days ahead, 50% 14+ days ahead, nothing after" */
export function policyText(p: restaurantApi.HallRefundPolicy): string {
  if (!p.tiers.length) return "No refund";
  const tiers = [...p.tiers].sort((a, b) => b.minDaysBefore - a.minDaysBefore);
  const pct = (bps: number) => (bps % 100 ? (bps / 100).toFixed(1) : String(bps / 100)) + "%";
  return `${tiers.map((t) => `${pct(t.refundBps)} back ${t.minDaysBefore}+ days ahead`).join(", ")}, nothing after`;
}
const when = (b: Booking) => `${dayLabel(torontoDay(b.startsAt))}, ${formatTime(b.startsAt)} to ${formatTime(b.endsAt)}`;

export function BookingsTab({ gate, goHalls, holding, onNewHold, onHoldClose }: { gate: Gate; goHalls: () => void; holding: boolean; onNewHold: () => void; onHoldClose: () => void }) {
  const { api } = useMerchant();
  const state = useApi(() => api.banquet.bookings(), [api], { pollMs: 60_000 });
  const halls = useApi(() => api.banquet.halls(), [api]);
  const [filter, setFilter] = useState<Filter>("all");
  const [hallId, setHallId] = useState("");
  const sp = useSearchParams();
  const [openId, setOpenId] = useState<string | null>(sp.get("booking"));
  const all = state.data?.items ?? [];
  const sorted = [...all].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const rows = sorted.filter((b) => (filter === "all" || b.status === filter) && (!hallId || b.hallId === hallId));
  const open = all.find((b) => b.id === openId) ?? null;
  const count = (s: Filter) => (s === "all" ? all.length : all.filter((b) => b.status === s).length);

  const columns: Column<Booking>[] = [
    { key: "hall", header: "Hall", mobile: "title", sortValue: (b) => b.hallName ?? "", cell: (b) => <span className="font-medium">{b.hallName ?? "Hall"}, {EVENT_TYPE_LABEL[b.eventType].toLowerCase()}</span> },
    { key: "when", header: "When", mobile: "subtitle", sortValue: (b) => b.startsAt, cell: (b) => when(b) },
    { key: "guests", header: "Guests", mobile: "subtitle", align: "end", sortValue: (b) => b.headcount, cell: (b) => `${formatNumber(b.headcount)} guests` },
    { key: "total", header: "Total", align: "end", mobile: "hidden", sortValue: (b) => b.totalCents, cell: (b) => formatMoney(b.totalCents) },
    { key: "status", header: "Status", mobile: "trailing", cell: (b) => <span className="flex flex-col items-start sm:items-start"><Dot tone={b.status === "hold" && b.holdExpiresAt && new Date(b.holdExpiresAt) < new Date() ? "negative" : TONE[b.status]}>{BOOKING_LABEL[b.status]}</Dot><span className="text-caption"><HoldLeft b={b} /></span></span> },
    { key: "open", header: "Details", mobile: "hidden", align: "end", cell: (b) => <button type="button" aria-label={`Open ${b.hallName ?? "hall"} booking`} onClick={() => setOpenId(b.id)} className="rounded-sm text-meta font-medium text-fg-muted hover:text-fg focus-visible:focus-ring">Open</button> },
  ];
  const noHalls = halls.data && halls.data.items.length === 0;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Capsules<Filter> label="Status" value={filter} onChange={setFilter} options={[{ value: "all", label: "All", count: count("all") }, ...BOOKING_ORDER.map((s) => ({ value: s as Filter, label: BOOKING_LABEL[s], count: count(s) }))]} />
        {halls.data && halls.data.items.length > 1 ? <div className="w-48"><Select label="Hall" hideLabel value={hallId} onChange={(e) => setHallId(e.target.value)} placeholder="All halls" options={halls.data.items.map((h) => ({ value: h.id, label: h.name }))} className="min-h-9 text-meta" /></div> : null}
      </div>
      {state.status === 402 ? <Loader state={state} gate={gate}>{() => null}</Loader> : (
        <DataTable
          caption="Hall bookings"
          columns={columns}
          rows={rows}
          rowKey={(b) => b.id}
          loading={state.loading && !state.data}
          error={state.error && !state.data ? state.error : null}
          onRetry={() => void state.reload()}
          onRowClick={(b) => setOpenId(b.id)}
          selectedKey={openId}
          empty={
            all.length ? (
              <EmptyState title="Nothing matches" description="Try another status or hall." action={<Button size="sm" variant="secondary" onClick={() => { setFilter("all"); setHallId(""); }}>Show all</Button>} className="border-0 px-4" />
            ) : noHalls ? (
              <EmptyState title="Add a hall first" description="Bookings are for a hall. Add the room, its seats and its price, then hold it for a walima or mehndi." action={<Button size="sm" onClick={goHalls}>Add a hall</Button>} className="border-0 px-4" />
            ) : (
              <EmptyState title="No bookings yet" description="A hold keeps the room for 72 hours while the family pays the deposit. Start one when someone calls." action={<Button size="sm" iconStart={Plus} onClick={onNewHold}>Hold a hall</Button>} className="border-0 px-4" />
            )
          }
        />
      )}
      {open ? <BookingSheet b={open} onClose={() => setOpenId(null)} reload={() => state.reload()} /> : null}
      {holding ? <NewHoldSheet halls={(halls.data?.items ?? []).filter((h) => h.active)} onClose={onHoldClose} onCreated={(b) => { onHoldClose(); void state.reload(); setOpenId(b.id); }} /> : null}
    </div>
  );
}

function BookingSheet({ b, onClose, reload }: { b: Booking; onClose: () => void; reload: () => Promise<void> }) {
  const { api, enabled, base } = useMerchant();
  const toast = useToast();
  const act = useAction();
  const left = useHoldLeft(b.status === "hold" ? b.holdExpiresAt : null);
  const [recording, setRecording] = useState<number | null>(null);
  const payee = useApi(() => api.settings.payment(), [api]);
  const [pay, setPay] = useState<{ paymentIntentId: string; clientSecret: string; amountCents: number } | null>(null);
  const [noCard, setNoCard] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [refund, setRefund] = useState<RefundState>(NO_REFUND);
  const [pick, setPick] = useState("");
  const cateringOn = enabled("restaurant.catering");
  const events = useApi(cateringOn ? () => api.catering.list({ limit: 100 }) : null, [api, cateringOn]);
  const linkable = (events.data?.items ?? []).filter((e) => e.status !== "cancelled" && e.status !== "completed" && !e.hallBookingId);
  const live = b.status === "hold" || b.status === "confirmed";
  const hold = b.status === "hold";
  const depositDue = b.depositCents > 0 && !b.depositPaidAt;
  // Only a deposit paid in the app can be refunded. One recorded by hand is returned directly (the server says so if you try).
  const refundable = !!b.depositPaidAt && b.depositCents > 0 && b.depositRefundCents === 0;
  // A deposit that landed after the cancel can still be refunded, once.
  const laterRefund = b.status === "cancelled" && refundable;
  const chosen = refundable ? refundBody(refund, b.depositCents) : null;

  const run = async <R,>(fn: () => Promise<R>, ok: string) => {
    const r = await act.run(fn);
    if (r === undefined) return;
    toast({ message: ok, tone: "success" });
    await reload();
  };
  return (
    <>
      <Sheet open onClose={onClose} label="Hall booking" title={`${b.hallName ?? "Hall"}, ${EVENT_TYPE_LABEL[b.eventType].toLowerCase()}`} subtitle={when(b)} width={480}>
        <div className="flex flex-col gap-5">
          {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Dot tone={left?.lapsed ? "negative" : TONE[b.status]}>{left?.lapsed ? "Hold lapsed" : BOOKING_LABEL[b.status]}</Dot>
            {hold && left && !left.lapsed ? <span className={left.urgent ? "text-meta text-negative" : "text-meta text-fg-muted"}>{left.text}</span> : null}
          </div>
          {left?.lapsed ? <Banner tone="warning">This hold ran out before the deposit came in, so the hall is open again. Start a new hold if they still want it.</Banner> : null}
          <DefList items={[
            { label: "When", value: formatDateTime(b.startsAt) },
            { label: "Until", value: formatTime(b.endsAt) },
            { label: "Guests", value: formatNumber(b.headcount) },
            { label: "Package", value: b.packageName ?? "Room only" },
            { label: "Total with tax", value: formatMoney(b.totalCents) },
            { label: "Deposit", value: b.depositPaidAt ? `${formatMoney(b.depositCents)} paid ${formatDateTime(b.depositPaidAt)}` : `${formatMoney(b.depositCents)} due` },
            ...(b.referenceCode ? [{ label: "Reference", value: b.referenceCode }] : []),
            ...(b.depositRefundCents > 0 ? [{ label: "Refund", value: refundedText(b.depositRefundCents, b.depositRefundedAt, formatDateTime) ?? "" }] : []),
            ...(b.refundPolicy ? [{ label: "Customer cancels", value: policyText(b.refundPolicy) }] : []),
            ...(b.notes ? [{ label: "Notes", value: b.notes }] : []),
          ]} />

          {b.schedule.length && b.status !== "cancelled" ? (
            <Section title="Payment schedule" description={b.schedule.every((r) => r.paidAt) ? "Paid in full." : undefined}>
              <ul className="divide-y divide-line border-y border-line">
                {b.schedule.map((r, i) => {
                  const due = !r.paidAt;
                  const first = due && b.schedule.findIndex((x) => !x.paidAt) === i;
                  return (
                    <li key={`${r.label}-${i}`} className="flex items-start justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <p className="text-body-strong text-fg">{r.label} ({bpsToPct(Math.round((r.amountCents / Math.max(1, b.totalCents)) * 10_000))})</p>
                        <p className="mt-0.5 flex items-center gap-1.5 text-meta text-fg-muted">
                          <span aria-hidden className={`size-1.5 rounded-full ${r.paidAt ? "bg-positive" : i === 0 && hold ? "bg-accent" : "bg-fg-subtle"}`} />
                          {r.paidAt ? `Paid ${dayLabel(r.paidAt.slice(0, 10))}` : i === 0 && hold ? "Due before the hold ends" : `Due ${dayLabel(r.dueOn)}`}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span className="text-body tabular text-fg">{formatMoney(r.amountCents)}</span>
                        {first && live && !left?.lapsed ? <button type="button" onClick={() => setRecording(i)} className="rounded-sm text-meta font-medium text-fg underline underline-offset-4 hover:no-underline focus-visible:focus-ring">Record payment</button> : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
              {b.manual && live ? <Banner tone="info" className="mt-3">Customer was told to send {formatMoney(b.manual.amountCents)} to {b.manual.email} with {b.manual.referenceCode} in the message.</Banner> : null}
              {b.payments?.length ? (
                <ul className="mt-2 text-caption text-fg-muted">
                  {b.payments.filter((p) => !p.voidedAt).map((p) => <li key={p.id}>{formatMoney(p.amountCents)} by {p.method === "etransfer" ? "e-transfer" : p.method}, {dayLabel(p.receivedOn)}{p.bankReference ? ` · ${p.bankReference}` : ""}</li>)}
                </ul>
              ) : null}
            </Section>
          ) : null}

          {hold && !left?.lapsed ? (
            <Section title="Deposit" description={depositDue ? `${formatMoney(b.depositCents)} locks in the date.` : "Deposit is in."}>
              <div className="flex flex-col gap-3">
                {depositDue ? (
                  pay ? (
                    <PaymentBox paymentIntentId={pay.paymentIntentId} clientSecret={pay.clientSecret} amountCents={pay.amountCents} label={`Take ${formatMoney(pay.amountCents)} deposit`} onPaid={async () => { toast({ message: "Deposit taken", tone: "success" }); setPay(null); await reload(); }} />
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="secondary" loading={act.busy} onClick={async () => { const r = await act.run(() => api.banquet.deposit(b.id)); if (r?.deposit?.clientSecret) setPay({ paymentIntentId: r.deposit.paymentIntentId, clientSecret: r.deposit.clientSecret, amountCents: r.deposit.amountCents }); else if (r) setNoCard(true); }}>Take deposit by card</Button>
                      <Button size="sm" variant="secondary" onClick={() => setRecording(0)}>Record deposit received</Button>
                    </div>
                  )
                ) : null}
                {noCard ? <p className="text-meta text-fg-muted">Card payments aren&apos;t set up for your shop yet. Record the deposit once they have paid you by e-transfer or cash.</p> : null}
                <div><Button size="sm" loading={act.busy} disabled={depositDue} onClick={() => void run(() => api.banquet.confirm(b.id, false), "Booking confirmed")}>Confirm booking</Button></div>
              </div>
            </Section>
          ) : null}

          {cateringOn && live ? (
            <Section title="Catering" description={b.cateringEventId ? "Linked to a catering event." : "Tie the food order to this hall."}>
              {b.cateringEventId ? (
                <Link href={`${base}/restaurant/catering/${b.cateringEventId}`} className="inline-flex items-center gap-1 text-meta font-medium text-fg underline underline-offset-4">Open the event <ExternalLink aria-hidden className="size-3" /></Link>
              ) : linkable.length ? (
                <>
                  <Select label="Catering event" value={pick} placeholder="Choose an event" onChange={(e) => setPick(e.target.value)} options={linkable.map((e) => ({ value: e.id, label: `#${e.number} ${EVENT_TYPE_LABEL[e.eventType]}${e.customer?.name ? `, ${e.customer.name}` : ""}, ${dayLabel(e.eventDate)}` }))} />
                  <div><Button size="sm" variant="secondary" disabled={!pick} loading={act.busy} onClick={() => void run(() => api.banquet.linkCatering(b.id, pick), "Catering event linked")}>Link event</Button></div>
                </>
              ) : <p className="text-meta text-fg-muted">No open catering events to link.</p>}
            </Section>
          ) : null}

          {laterRefund ? (
            <Section title="Deposit" description={`${formatMoney(b.depositCents)} arrived after this booking was cancelled.`}>
              <Button size="sm" variant="secondary" onClick={() => setCancelling(true)}>Refund the deposit</Button>
            </Section>
          ) : null}

          {live ? (
            <Section title="Close out">
              <div className="flex flex-wrap gap-2">
                {b.status === "confirmed" ? <Button size="sm" loading={act.busy} onClick={() => void run(() => api.banquet.complete(b.id), "Marked completed")}>Mark completed</Button> : null}
                <Button size="sm" variant="ghost" onClick={() => setCancelling(true)}>{hold ? "Release the hold" : "Cancel booking"}</Button>
              </div>
            </Section>
          ) : null}
        </div>
      </Sheet>
      {recording !== null && b.schedule[recording] ? (
        <RecordPaymentPanel
          subtitle={`${b.hallName ?? "Hall"}, ${EVENT_TYPE_LABEL[b.eventType].toLowerCase()} · ${when(b)}`}
          rows={[
            { label: b.schedule[recording]!.label, value: <strong>{formatMoney(b.schedule[recording]!.amountCents)}</strong> },
            ...(payee.data?.etransferEmail ? [{ label: "Told to send to", value: payee.data.etransferEmail }] : []),
            ...(b.referenceCode ? [{ label: "Reference in message", value: <strong>{b.referenceCode}</strong> }] : []),
          ]}
          amountCents={b.schedule[recording]!.amountCents}
          note={recording === 0 ? "Check the deposit in your bank first. Recording it marks the first payment as in, then you can confirm the booking." : "Check the payment in your bank first."}
          onClose={() => setRecording(null)}
          onRecord={async (body) => {
            await api.banquet.recordPayment(b.id, { ...body, instalmentIndex: recording });
            await reload();
          }}
        />
      ) : null}
      <ConfirmDialog
        open={cancelling}
        onClose={() => { setCancelling(false); setRefund(NO_REFUND); }}
        danger
        title={laterRefund ? "Refund this deposit?" : hold ? "Release this hold?" : "Cancel this booking?"}
        body={laterRefund ? "The booking is already cancelled. This returns the deposit to the card it was paid with." : `The hall opens up for that time again.${refundable ? " The customer is told, along with what happens to their deposit." : ""}`}
        confirmLabel={laterRefund ? "Refund deposit" : refund.mode === "none" ? (hold ? "Release hold" : "Cancel booking") : "Cancel and refund"}
        disabled={refundable && chosen === null}
        onConfirm={async () => {
          const r = await api.banquet.cancel(b.id, refundable ? (chosen ?? undefined) : undefined);
          toast({ message: r.depositRefundCents > 0 ? `${laterRefund ? "Deposit refunded" : "Booking cancelled"}. ${formatMoney(r.depositRefundCents)} is on its way back.` : hold ? "Hold released" : "Booking cancelled", tone: "success" });
          setRefund(NO_REFUND);
          await reload();
        }}
      >
        {refundable ? <RefundChoice depositCents={b.depositCents} value={refund} onChange={setRefund} hint={b.refundPolicy && !laterRefund ? `Your policy for customers who cancel: ${policyText(b.refundPolicy)}. You choose here, so the policy is not applied.` : "If you took the deposit by e-transfer or cash, keep it here and return it yourself. The app can only refund card payments."} /> : null}
      </ConfirmDialog>
    </>
  );
}

export function NewHoldSheet({ halls, onClose, onCreated }: { halls: restaurantApi.HallDto[]; onClose: () => void; onCreated: (b: Booking) => void }) {
  const { api, enabled } = useMerchant();
  const toast = useToast();
  const act = useAction();
  const [hallId, setHallId] = useState(halls[0]?.id ?? "");
  const [type, setType] = useState<restaurantApi.CateringEventType>("walima");
  const [date, setDate] = useState(addDaysISO(todayISO(), 30));
  const [start, setStart] = useState("17:00");
  const [end, setEnd] = useState("23:00");
  const [guests, setGuests] = useState("150");
  const [pkg, setPkg] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [eventId, setEventId] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const cateringOn = enabled("restaurant.catering");
  const events = useApi(cateringOn ? () => api.catering.list({ limit: 100 }) : null, [api, cateringOn]);
  const linkable = (events.data?.items ?? []).filter((e) => e.status !== "cancelled" && e.status !== "completed" && !e.hallBookingId);
  // The halls may arrive after the sheet opens: fall back to the first open hall so the form is never stuck on an empty choice.
  const hall = halls.find((h) => h.id === hallId) ?? halls[0];
  const n = Number(guests) || 0;
  const sub = hall ? hall.baseCents + (hall.packages.find((p) => p.name === pkg)?.perHeadCents ?? 0) * n : 0;

  const submit = async () => {
    const e: Record<string, string> = {};
    if (!hall) e.hall = "Add a hall first";
    if (name.trim().length < 2) e.name = "Add the customer's name";
    if (phone.replace(/\D/g, "").length < 7) e.phone = "Add a phone number";
    if (!(n >= 1)) e.guests = "How many guests?";
    else if (hall && n > hall.capacity) e.guests = `${hall.name} seats ${formatNumber(hall.capacity)}`;
    if (end <= start) e.end = "End time must be after the start";
    setErrors(e);
    if (Object.keys(e).length) return;
    const r = await act.run(() =>
      api.banquet.createHold({ hallId: hall!.id, eventType: type, startsAt: torontoInstant(date, start), endsAt: torontoInstant(date, end), headcount: n, packageName: pkg || null, notes: notes.trim() || null, cateringEventId: eventId || null, customer: { phone: phone.trim(), name: name.trim() } }),
    );
    if (r) {
      toast({ message: "Hall on hold for 72 hours", tone: "success" });
      onCreated(r.booking);
    }
  };
  return (
    <Sheet open onClose={onClose} label="New hold" title="Hold a hall" subtitle="Keeps the room for up to 72 hours while the deposit comes in." width={520}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={act.busy} disabled={!hall} onClick={() => void submit()}>Hold the hall</Button></>}>
      <div className="flex flex-col gap-4">
        {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
        {!halls.length ? <Banner tone="warning">You have no open halls. Add one in the Halls tab first.</Banner> : null}
        <FormGrid>
          <Select label="Hall" value={hall?.id ?? ""} onChange={(e) => { setHallId(e.target.value); setPkg(""); }} options={halls.map((h) => ({ value: h.id, label: `${h.name}, seats ${h.capacity}` }))} error={errors.hall} />
          <Select label="Kind of event" value={type} onChange={(e) => setType(e.target.value as restaurantApi.CateringEventType)} options={EVENT_TYPE_OPTIONS} />
        </FormGrid>
        <FormGrid cols={3}>
          <TextField label="Date" type="date" min={todayISO()} value={date} onChange={(e) => setDate(e.target.value)} />
          <TextField label="From" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
          <TextField label="Until" type="time" value={end} onChange={(e) => setEnd(e.target.value)} error={errors.end} />
        </FormGrid>
        <FormGrid>
          <NumberField label="Guests" value={guests} onChange={setGuests} error={errors.guests} />
          <Select label="Package" value={pkg} onChange={(e) => setPkg(e.target.value)} placeholder="Room only" options={(hall?.packages ?? []).map((p) => ({ value: p.name, label: `${p.name}, ${formatMoney(p.perHeadCents)} a guest` }))} />
        </FormGrid>
        {hall ? <p className="text-meta text-fg-muted">About {formatMoney(sub)} before tax. Deposit is {bpsToPct(hall.depositBps)} of the total.</p> : null}
        <FormGrid>
          <TextField label="Customer name" placeholder="Bilal Ahmed" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} />
          <TextField label="Phone" type="tel" placeholder="(905) 555-0123" value={phone} onChange={(e) => setPhone(e.target.value)} error={errors.phone} />
        </FormGrid>
        {cateringOn && linkable.length ? <Select label="Catering event" value={eventId} onChange={(e) => setEventId(e.target.value)} placeholder="Not linked" options={linkable.map((x) => ({ value: x.id, label: `#${x.number} ${EVENT_TYPE_LABEL[x.eventType]}${x.customer?.name ? `, ${x.customer.name}` : ""}` }))} hint="Optional. Link the food order now or later." /> : null}
        <TextField type="textarea" label="Notes" optionalLabel className="min-h-20" placeholder="Separate seating, nikah at 5 pm, dinner at 7" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
    </Sheet>
  );
}
