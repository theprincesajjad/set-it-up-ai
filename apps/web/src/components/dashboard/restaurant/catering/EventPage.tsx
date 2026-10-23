"use client";
import { Copy, ExternalLink, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { restaurantApi } from "@ll/shared";
import type { commerceApi } from "@ll/shared";
import { DefList, EmptyState, Panel, Section, StatusDot } from "@/components/dashboard/kit";
import { ConfirmDialog } from "@/components/dashboard/ConfirmDialog";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Banner } from "@/components/ui/Banner";
import { Button, IconButton } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { formatDateTime, formatMoney, formatNumber } from "@/lib/format";
import { useAction, useApi } from "@/lib/dashboard/useApi";
import { RecordPaymentPanel } from "../RecordPaymentPanel";
import { CheckRow, FormGrid, GroupLabel, MoneyField, NumberField, addDaysISO, bpsToPct, centsToField, copyText, dayLabel, fieldToCents, todayISO, torontoInstant } from "../common";
import { NO_REFUND, RefundChoice, refundBody, refundedText, type RefundState } from "../RefundChoice";
import { EVENT_TYPE_LABEL, EVENT_TYPE_OPTIONS, SERVICE_LABEL, SERVICE_OPTIONS, STATUS_LABEL } from "./labels";

type Ev = restaurantApi.CateringEventDto;
const EDITABLE = ["inquiry", "tasting", "quoted"];
const editable = (e: Ev) => EDITABLE.includes(e.status) && !e.approvedAt;

export function EventPage({ event, onChange }: { event: Ev; onChange: (e: Ev) => void }) {
  const title = `${EVENT_TYPE_LABEL[event.eventType]}${event.customer?.name ? `, ${event.customer.name}` : ""}`;
  return (
    <div className="grid gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="order-2 flex min-w-0 flex-col gap-8 lg:order-1">
        <Details event={event} onChange={onChange} />
        <MenuBuilder event={event} onChange={onChange} />
      </div>
      <aside aria-label={`Steps for ${title}`} className="order-1 flex min-w-0 flex-col gap-6 lg:order-2">
        <NextSteps event={event} onChange={onChange} />
      </aside>
    </div>
  );
}

/* ------------------------------------------------------------- details */

function Details({ event, onChange }: { event: Ev; onChange: (e: Ev) => void }) {
  const { api } = useMerchant();
  const toast = useToast();
  const act = useAction();
  const can = editable(event);
  const init = () => ({
    eventType: event.eventType, eventDate: event.eventDate, startTime: event.startTime ?? "", headcount: String(event.headcount), service: event.service,
    venueName: event.venueName ?? "", venueAddress: event.venueAddress ?? "", dietaryNotes: event.dietaryNotes ?? "", notes: event.notes ?? "",
  });
  const [f, setF] = useState(init);
  const [saved, setSaved] = useState(init);
  const dirty = JSON.stringify(f) !== JSON.stringify(saved);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const save = async () => {
    const r = await act.run(() =>
      api.catering.update(event.id, {
        eventType: f.eventType, eventDate: f.eventDate, startTime: f.startTime || null, headcount: Math.max(1, Number(f.headcount) || 1), service: f.service,
        venueName: f.venueName.trim() || null, venueAddress: f.venueAddress.trim() || null, dietaryNotes: f.dietaryNotes.trim() || null, notes: f.notes.trim() || null,
      }),
    );
    if (r) {
      setSaved(f);
      onChange(r);
      toast({ message: event.status === "quoted" && r.status !== "quoted" ? "Saved. The quote was pulled back, so send it again." : "Details saved", tone: "success" });
    }
  };
  return (
    <Panel
      title="Event details"
      description={can ? undefined : "This event is locked. Cancel it or start a new inquiry to change the plan."}
      footer={can ? (<><Button variant="secondary" disabled={!dirty} onClick={() => setF(saved)}>Discard</Button><Button loading={act.busy} disabled={!dirty} onClick={() => void save()}>Save details</Button></>) : undefined}
    >
      <div className="flex flex-col gap-4">
        {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
        {event.status === "quoted" && can ? <Banner tone="info">Changing the date or guest count pulls the quote back. You will need to send it again.</Banner> : null}
        <FormGrid>
          <Select label="Kind of event" disabled={!can} value={f.eventType} onChange={(e) => set("eventType", e.target.value as restaurantApi.CateringEventType)} options={EVENT_TYPE_OPTIONS} />
          <Select label="How it's served" disabled={!can} value={f.service} onChange={(e) => set("service", e.target.value as restaurantApi.CateringService)} options={SERVICE_OPTIONS} />
        </FormGrid>
        <FormGrid cols={3}>
          <TextField label="Event date" type="date" disabled={!can} value={f.eventDate} onChange={(e) => set("eventDate", e.target.value)} />
          <TextField label="Start time" type="time" optionalLabel disabled={!can} value={f.startTime} onChange={(e) => set("startTime", e.target.value)} />
          <NumberField label="Guests" disabled={!can} value={f.headcount} onChange={(v) => set("headcount", v)} hint={can && event.menu.length ? "Per-guest lines reprice" : undefined} />
        </FormGrid>
        <FormGrid>
          <TextField label="Venue" optionalLabel disabled={!can} value={f.venueName} onChange={(e) => set("venueName", e.target.value)} />
          <TextField label="Venue address" optionalLabel disabled={!can} value={f.venueAddress} onChange={(e) => set("venueAddress", e.target.value)} />
        </FormGrid>
        <TextField type="textarea" label="Dietary needs" optionalLabel disabled={!can} className="min-h-20" placeholder="Zabihah only, 12 vegetarian guests, one nut allergy" value={f.dietaryNotes} onChange={(e) => set("dietaryNotes", e.target.value)} />
        <TextField type="textarea" label="Notes" optionalLabel disabled={!can} className="min-h-20" value={f.notes} onChange={(e) => set("notes", e.target.value)} />
        {event.customer ? (
          <DefList items={[{ label: "Customer", value: event.customer.name ?? "No name" }, { label: "Phone", value: event.customer.phone ? <a className="hover:underline" href={`tel:${event.customer.phone}`}>{event.customer.phone}</a> : "None" }, { label: "Email", value: event.customer.email ?? "None" }]} />
        ) : null}
      </div>
    </Panel>
  );
}

/* --------------------------------------------------------- menu builder */

interface Line {
  key: string;
  catalogItemId: string | null;
  name: string;
  pricing: "per_head" | "tray";
  perHead: string;
  qty: string;
  unit: string;
}
interface Extra {
  key: string;
  description: string;
  qty: string;
  unit: string;
}
let seq = 0;
const nk = () => `l${++seq}`;

function MenuBuilder({ event, onChange }: { event: Ev; onChange: (e: Ev) => void }) {
  const { api, detail, base } = useMerchant();
  const toast = useToast();
  const act = useAction();
  const can = editable(event);
  const catalog = useApi(() => api.catalog(), [api]);
  const tax = useApi(() => api.catering.taxInfo(detail.merchant.slug), [api, detail.merchant.slug]);
  const fromEvent = () => ({
    lines: event.menu.map<Line>((m) => ({ key: nk(), catalogItemId: m.catalogItemId, name: m.name, pricing: m.perHeadCents != null ? "per_head" : "tray", perHead: centsToField(m.perHeadCents), qty: String(m.quantity ?? 1), unit: centsToField(m.unitPriceCents) })),
    extras: event.lineItems.slice(event.menu.length).filter((l) => !l.description.startsWith("Service charge")).map<Extra>((l) => ({ key: nk(), description: l.description, qty: String(l.quantity), unit: centsToField(l.unitPriceCents) })),
    deposit: String(event.depositBps / 100),
    service: event.serviceChargeBps ? String(event.serviceChargeBps / 100) : "",
  });
  const [state, setState] = useState(fromEvent);
  const [saved, setSaved] = useState(() => JSON.stringify(strip(fromEvent())));
  const [pick, setPick] = useState("");
  const { lines, extras, deposit, service } = state;
  const headcount = event.headcount;
  const dirty = JSON.stringify(strip(state)) !== saved;

  const items = catalog.data?.items.filter((i) => i.available) ?? [];
  const setLines = (fn: (l: Line[]) => Line[]) => setState((s) => ({ ...s, lines: fn(s.lines) }));
  const setExtras = (fn: (l: Extra[]) => Extra[]) => setState((s) => ({ ...s, extras: fn(s.extras) }));
  const addCatalog = (id: string) => {
    const it = items.find((i) => i.id === id);
    if (!it) return;
    setLines((l) => [...l, lineFor(it, headcount)]);
    setPick("");
  };

  const totals = useMemo(() => {
    const lineTotal = (l: Line) => (l.pricing === "per_head" ? fieldToCents(l.perHead) * headcount : (Number(l.qty) || 0) * fieldToCents(l.unit));
    const food = lines.reduce((s, l) => s + lineTotal(l), 0) + extras.reduce((s, x) => s + (Number(x.qty) || 0) * fieldToCents(x.unit), 0);
    // A mandatory service charge is taxed like food (tips are not modelled on quotes).
    const svcBps = Math.round((Number(service) || 0) * 100);
    const svcC = food > 0 ? Math.round((food * svcBps) / 10_000) : 0;
    const sub = food;
    const taxable = food + svcC;
    const notRegistered = event.tax?.registered === false;
    const rate = notRegistered ? 0 : (tax.data?.ratePpm ?? (event.subtotalCents > 0 ? Math.round((event.taxCents / event.subtotalCents) * 1_000_000) : null));
    const taxC = rate == null ? null : Math.round((taxable * rate) / 1_000_000);
    const total = taxable + (taxC ?? 0);
    const bps = Math.round((Number(deposit) || 0) * 100);
    return { sub, svcC, svcBps, taxC, total, bps, dep: Math.round((total * bps) / 10_000), lineTotal, label: notRegistered ? "No HST charged (small supplier)" : (tax.data?.label ?? "Tax") };
  }, [lines, extras, deposit, service, headcount, tax.data, event.subtotalCents, event.taxCents, event.tax?.registered]);

  const save = async () => {
    const body: restaurantApi.CateringMenuBody = {
      items: lines.filter((l) => l.name.trim()).map((l) => ({
        ...(l.catalogItemId ? { catalogItemId: l.catalogItemId } : { name: l.name.trim() }),
        pricing: l.pricing,
        ...(l.pricing === "per_head" ? { perHeadCents: fieldToCents(l.perHead) } : { quantity: Math.max(1, Number(l.qty) || 1), unitPriceCents: fieldToCents(l.unit) }),
      })),
      extras: extras.filter((x) => x.description.trim()).map((x) => ({ description: x.description.trim(), quantity: Math.max(1, Number(x.qty) || 1), unitPriceCents: fieldToCents(x.unit) })),
      depositBps: Math.min(10_000, totals.bps),
      serviceChargeBps: Math.min(3000, totals.svcBps),
    };
    const r = await act.run(() => api.catering.setMenu(event.id, body));
    if (r) {
      setSaved(JSON.stringify(strip(state)));
      onChange(r);
      toast({ message: event.status === "quoted" ? "Menu saved. The quote was pulled back, so send it again." : "Menu saved", tone: "success" });
    }
  };

  const perGuest = headcount ? Math.round(totals.total / headcount) : 0;
  return (
    <Panel
      title="Menu and pricing"
      description={can ? "Price by the head for buffets, or by the tray for biryani, nihari and karahi." : "Locked with the event."}
      footer={can ? (<><Button variant="secondary" disabled={!dirty} onClick={() => setState(fromEvent())}>Discard</Button><Button loading={act.busy} disabled={!dirty} onClick={() => void save()}>Save menu</Button></>) : undefined}
    >
      <div className="flex flex-col gap-5">
        {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
        {event.tax?.registered === null ? (
          <Banner tone="warning" title="Set your tax status" action={<Button size="sm" variant="secondary" href={`${base}/restaurant/payments`}>Set it</Button>}>
            Quotes still add tax, but say &quot;tax status not set&quot; until you tell us if you are registered for GST/HST.
          </Banner>
        ) : null}
        {lines.length === 0 && !can ? <p className="text-meta text-fg-muted">No menu was built for this event.</p> : null}
        {lines.length === 0 && can ? (
          <EmptyState title="No dishes yet" description={`Pick from your menu below, or add a custom line. ${formatNumber(headcount)} guests so far.`} className="border-0 border-b py-3" />
        ) : null}
        <ul className="flex flex-col divide-y divide-line border-y border-line" aria-label="Menu lines">
          {lines.map((l) => (
            <li key={l.key} className="flex flex-col gap-3 py-3">
              <div className="flex items-start justify-between gap-2">
                {l.catalogItemId || !can ? <p className="text-body text-fg">{l.name}</p> : <div className="flex-1"><TextField label="Dish" hideLabel placeholder="Chicken biryani" value={l.name} onChange={(e) => setLines((ls) => ls.map((x) => (x.key === l.key ? { ...x, name: e.target.value } : x)))} /></div>}
                <p className="shrink-0 text-body tabular text-fg">{formatMoney(totals.lineTotal(l))}</p>
              </div>
              {can ? (
                <div className="grid grid-cols-2 items-end gap-3 sm:grid-cols-[10rem_1fr_1fr_auto]">
                  <Select label="Priced" value={l.pricing} onChange={(e) => setLines((ls) => ls.map((x) => (x.key === l.key ? { ...x, pricing: e.target.value as Line["pricing"] } : x)))} options={[{ value: "per_head", label: "Per guest" }, { value: "tray", label: "By the tray" }]} />
                  {l.pricing === "per_head" ? (
                    <>
                      <MoneyField label="Per guest" disabled={!can} value={l.perHead} onChange={(v) => setLines((ls) => ls.map((x) => (x.key === l.key ? { ...x, perHead: v } : x)))} />
                      <p className="pb-3 text-meta text-fg-muted">× {formatNumber(headcount)} guests</p>
                    </>
                  ) : (
                    <>
                      <NumberField label="Trays" disabled={!can} value={l.qty} onChange={(v) => setLines((ls) => ls.map((x) => (x.key === l.key ? { ...x, qty: v } : x)))} />
                      <MoneyField label="Per tray" disabled={!can} value={l.unit} onChange={(v) => setLines((ls) => ls.map((x) => (x.key === l.key ? { ...x, unit: v } : x)))} />
                    </>
                  )}
                  <IconButton icon={Trash2} label={`Remove ${l.name || "line"}`} size={40} className="mb-3 justify-self-end" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} />
                </div>
              ) : (
                <p className="text-meta text-fg-muted">{l.pricing === "per_head" ? `${formatMoney(fieldToCents(l.perHead))} a guest × ${formatNumber(headcount)}` : `${l.qty} trays × ${formatMoney(fieldToCents(l.unit))}`}</p>
              )}
            </li>
          ))}
        </ul>
        {can ? (
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-0 flex-1 basis-60">
              <Select label="Add from your menu" value={pick} placeholder={catalog.loading ? "Loading your menu" : items.length ? "Choose a dish or tray" : "No dishes on your menu yet"} onChange={(e) => addCatalog(e.target.value)} options={items.map((i) => ({ value: i.id, label: `${i.name} · ${formatMoney(i.priceCents)}${i.serves ? ` · serves ${i.serves}` : ""}` }))} disabled={!items.length} />
            </div>
            <Button variant="secondary" size="sm" iconStart={Plus} className="mb-6" onClick={() => setLines((l) => [...l, { key: nk(), catalogItemId: null, name: "", pricing: "tray", perHead: "", qty: "1", unit: "" }])}>Custom line</Button>
          </div>
        ) : null}

        <Section title="Extras" description="Staffing, delivery, chafing dishes, serving spoons.">
          <ul className="flex flex-col divide-y divide-line border-y border-line">
            {extras.map((x) => (
              <li key={x.key} className="grid grid-cols-[1fr_auto] items-end gap-x-3 gap-y-1 py-3 sm:grid-cols-[1fr_6rem_9rem_auto]">
                <div className="col-span-2 sm:col-span-1"><TextField label="Extra" hideLabel placeholder="Delivery and setup" disabled={!can} value={x.description} onChange={(e) => setExtras((xs) => xs.map((y) => (y.key === x.key ? { ...y, description: e.target.value } : y)))} /></div>
                <NumberField label="Qty" disabled={!can} value={x.qty} onChange={(v) => setExtras((xs) => xs.map((y) => (y.key === x.key ? { ...y, qty: v } : y)))} />
                <MoneyField label="Each" disabled={!can} value={x.unit} onChange={(v) => setExtras((xs) => xs.map((y) => (y.key === x.key ? { ...y, unit: v } : y)))} />
                {can ? <IconButton icon={Trash2} label={`Remove ${x.description || "extra"}`} size={40} className="mb-3" onClick={() => setExtras((xs) => xs.filter((y) => y.key !== x.key))} /> : null}
              </li>
            ))}
          </ul>
          {can ? <div className="mt-2"><Button variant="ghost" size="sm" iconStart={Plus} onClick={() => setExtras((x) => [...x, { key: nk(), description: "", qty: "1", unit: "" }])}>Add an extra</Button></div> : null}
        </Section>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="sm:order-2">
            <GroupLabel>Totals</GroupLabel>
            <dl className="mt-1 divide-y divide-line border-y border-line text-meta" aria-live="polite">
              <Total label="Subtotal" value={formatMoney(totals.sub)} muted />
              {totals.svcBps > 0 ? <Total label={`Service charge ${bpsToPct(totals.svcBps)}${event.tax?.registered === false ? "" : " (tax applies)"}`} value={formatMoney(totals.svcC)} muted /> : null}
              <Total label={totals.label} value={totals.taxC == null ? "Added when you save" : formatMoney(totals.taxC)} muted />
              <Total label="Total" value={formatMoney(totals.total)} strong />
              <Total label={`Deposit (${bpsToPct(totals.bps)})`} value={formatMoney(totals.dep)} />
              <Total label="Balance after deposit" value={formatMoney(totals.total - totals.dep)} muted />
            </dl>
            <p className="mt-1 text-meta text-fg-muted">About {formatMoney(perGuest)} a guest, tax included. {dirty ? "Estimate until you save." : null}</p>
            {event.tax ? <p className="mt-0.5 text-meta text-fg-muted">{event.tax.label}.{event.tax.registered === null ? " Set your tax status in How you get paid." : ""}</p> : null}
          </div>
          <div className="flex flex-col gap-3 sm:order-1">
            <TextField label="Service charge" suffix="%" inputMode="decimal" optionalLabel disabled={!can} value={service} onChange={(e) => setState((s) => ({ ...s, service: e.target.value.replace(/[^0-9.]/g, "") }))} hint="A mandatory charge on top of food, such as 10%. It is taxed. Tips are not added here." />
            <TextField label="Deposit to confirm" suffix="%" inputMode="decimal" disabled={!can} value={deposit} onChange={(e) => setState((s) => ({ ...s, deposit: e.target.value.replace(/[^0-9.]/g, "") }))} hint="Share of the total due when the customer approves" />
          </div>
        </div>
      </div>
    </Panel>
  );
}

function strip(s: { lines: Line[]; extras: Extra[]; deposit: string; service: string }) {
  return { lines: s.lines.map((l) => ({ ...l, key: "" })), extras: s.extras.map((x) => ({ ...x, key: "" })), deposit: s.deposit, service: s.service };
}

function lineFor(it: commerceApi.CatalogItemDto, headcount: number): Line {
  const serves = it.serves && it.serves > 0 ? it.serves : null;
  return {
    key: nk(),
    catalogItemId: it.id,
    name: it.name,
    // Pots and trays that say who they serve are sold by the tray; everything else by the head.
    pricing: serves ? "tray" : "per_head",
    perHead: centsToField(serves ? Math.round(it.priceCents / serves) : it.priceCents),
    qty: String(serves ? Math.max(1, Math.ceil(headcount / serves)) : 1),
    unit: centsToField(it.priceCents),
  };
}

function Total({ label, value, strong, muted }: { label: string; value: string; strong?: boolean; muted?: boolean }) {
  return (
    <div className="flex min-h-9 items-center justify-between gap-3">
      <dt className={muted ? "text-fg-muted" : "text-fg"}>{label}</dt>
      <dd className={strong ? "text-body-strong tabular text-fg" : muted ? "tabular text-fg-muted" : "tabular text-fg"}>{value}</dd>
    </div>
  );
}

/* ----------------------------------------------------------- next steps */

function NextSteps({ event, onChange }: { event: Ev; onChange: (e: Ev) => void }) {
  const { api, enabled, base } = useMerchant();
  const toast = useToast();
  const act = useAction();
  const [tDate, setTDate] = useState(addDaysISO(todayISO(), 3));
  const [tTime, setTTime] = useState("17:00");
  const [sms, setSms] = useState(true);
  const [email, setEmail] = useState(true);
  const [recording, setRecording] = useState<"deposit" | "balance" | null>(null);
  const payee = useApi(() => api.settings.payment(), [api]);
  const [sendInvoice, setSendInvoice] = useState(true);
  const [invoice, setInvoice] = useState<restaurantApi.CateringInvoiceDto | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");
  const [refund, setRefund] = useState<RefundState>(NO_REFUND);
  const [hallPick, setHallPick] = useState("");
  const banquetOn = enabled("restaurant.banquet");
  const bookings = useApi(banquetOn ? () => api.banquet.bookings() : null, [api, banquetOn]);

  const doing = async <R,>(fn: () => Promise<R>, ok: string, apply?: (r: R) => void) => {
    const r = await act.run(fn);
    if (r === undefined) return;
    toast({ message: ok, tone: "success" });
    apply?.(r);
  };
  const ev = (r: Ev) => onChange(r);
  const st = event.status;
  const closed = st === "completed" || st === "cancelled";
  const hasMenu = event.lineItems.length > 0;

  const link = event.approvalUrl;
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  const steps: { label: string; value: string }[] = [
    { label: "Inquiry", value: "Received" },
    { label: "Tasting", value: event.tastingAt ? formatDateTime(event.tastingAt) : "Not booked" },
    { label: "Quote", value: event.quoteSentAt ? `Sent ${formatDateTime(event.quoteSentAt)}${event.quoteOpenedAt ? `, opened ${formatDateTime(event.quoteOpenedAt)}` : st === "quoted" ? ", not opened yet" : ""}` : "Not sent" },
    { label: "Approval", value: event.approvedAt ? `${event.signatureName ?? "Customer"}, ${formatDateTime(event.approvedAt)}` : "Waiting" },
    { label: "Deposit", value: event.depositPaidAt ? `${formatMoney(event.depositCents)} paid${event.depositMethod === "etransfer" ? " by e-transfer" : event.depositMethod && event.depositMethod !== "card" ? ` by ${event.depositMethod}` : ""} ${event.depositReceivedOn ? dayLabel(event.depositReceivedOn) : formatDateTime(event.depositPaidAt)}` : event.depositCents ? `${formatMoney(event.depositCents)} due${event.approvedAt ? ", awaiting" : ""}` : "None" },
    ...(event.referenceCode ? [{ label: "Reference", value: event.referenceCode }] : []),
    ...(event.depositRefundCents > 0 ? [{ label: "Refund", value: refundedText(event.depositRefundCents, event.depositRefundedAt, formatDateTime) ?? "" }] : []),
  ];
  // Only a deposit paid by card in the app can be refunded here; one marked received by hand is returned directly.
  const refundable = !!event.depositPaidAt && event.depositCents > 0 && event.depositRefundCents === 0;
  const openBookings = (bookings.data?.items ?? []).filter((b) => b.status === "hold" || b.status === "confirmed");

  return (
    <>
      <div>
        <div className="flex items-center justify-between gap-3 border-b border-line pb-2">
          <h2 className="text-body-strong text-fg">Where it stands</h2>
          <StatusDot domain="catering" status={st} label={STATUS_LABEL[st]} />
        </div>
        <DefList className="border-t-0" items={[...steps, { label: "Event", value: `${dayLabel(event.eventDate)}${event.startTime ? `, ${event.startTime}` : ""}` }, { label: "Guests", value: formatNumber(event.headcount) }, { label: "Service", value: SERVICE_LABEL[event.service] }, ...(event.totalCents ? [{ label: "Total", value: formatMoney(event.totalCents) }, { label: "Balance", value: formatMoney(event.depositPaidAt ? event.balanceCents : event.totalCents) }] : [])]} />
      </div>
      {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
      {event.dateClashes ? <Banner tone="warning" title="Another booking that day">{event.dateClashes === 1 ? "A confirmed event or hall booking" : `${event.dateClashes} confirmed events or hall bookings`} is on {dayLabel(event.eventDate)}. You can still go ahead.</Banner> : null}
      <PaymentsCard event={event} payee={payee.data ?? null} onRecord={setRecording} />

      {(st === "inquiry" || st === "tasting") ? (
        <Section title="Tasting" description={event.tastingAt ? `Booked for ${formatDateTime(event.tastingAt)}` : "Optional. Have them try the biryani before they commit."}>
          <div className="grid grid-cols-2 gap-3">
            <TextField label="Date" type="date" min={todayISO()} value={tDate} onChange={(e) => setTDate(e.target.value)} />
            <TextField label="Time" type="time" value={tTime} onChange={(e) => setTTime(e.target.value)} />
          </div>
          <div><Button size="sm" variant="secondary" loading={act.busy} disabled={!tDate || !tTime} onClick={() => void doing(() => api.catering.tasting(event.id, torontoInstant(tDate, tTime)), "Tasting booked. The customer has been told.", ev)}>{event.tastingAt ? "Move the tasting" : "Book tasting"}</Button></div>
        </Section>
      ) : null}

      {EDITABLE.includes(st) && !event.approvedAt ? (
        <Section title="Quote" description={hasMenu ? `${formatMoney(event.totalCents)} with ${formatMoney(event.depositCents)} deposit` : "Build the menu first. Then send the quote."}>
          <div className="flex flex-col gap-1">
            <CheckRow checked={sms} onChange={setSms} label="Text it" />
            <CheckRow checked={email} onChange={setEmail} label="Email it" />
          </div>
          <div>
            <Button size="sm" loading={act.busy} disabled={!hasMenu || (!sms && !email)} onClick={() => void doing(() => api.catering.sendQuote(event.id, [...(sms ? (["sms"] as const) : []), ...(email ? (["email"] as const) : [])]), "Quote sent", ev)}>
              {st === "quoted" ? "Send the quote again" : "Send quote"}
            </Button>
          </div>
        </Section>
      ) : null}

      {link ? (
        <Section title="Approval link" description="The customer reviews and approves on their phone. No login.">
          <div className="flex items-center gap-2">
            <input readOnly aria-label="Approval link" value={link} onFocus={(e) => e.currentTarget.select()} className="h-9 min-w-0 flex-1 rounded-input border border-line bg-bg-subtle px-3 text-meta text-fg" />
            <Button size="sm" variant="secondary" iconStart={Copy} onClick={async () => { const ok = await copyText(link); setCopied(ok); if (!ok) toast({ message: "Couldn't copy. Select the link and copy it.", tone: "error" }); }}>{copied ? "Copied" : "Copy"}</Button>
            <IconButton icon={ExternalLink} label="Open the approval page" size={40} onClick={() => window.open(link, "_blank", "noopener")} />
          </div>
        </Section>
      ) : null}

      {recording ? (
        <RecordPaymentPanel
          title={recording === "deposit" ? "Record the deposit" : "Record a payment"}
          subtitle={`${EVENT_TYPE_LABEL[event.eventType]}${event.customer?.name ? `, ${event.customer.name}` : ""} · #${event.number}`}
          rows={[
            { label: recording === "deposit" ? `Deposit (${bpsToPct(event.depositBps)})` : "Balance", value: <strong>{formatMoney(recording === "deposit" ? Math.max(0, event.depositCents - event.payments!.filter((p) => p.subjectType === "catering_deposit" && !p.voidedAt).reduce((a, p) => a + p.amountCents, 0)) : event.balanceCents)}</strong> },
            ...(payee.data?.etransferEmail ? [{ label: "Told to send to", value: payee.data.etransferEmail }] : []),
            ...(event.referenceCode ? [{ label: "Reference in message", value: <strong>{event.referenceCode}</strong> }] : []),
          ]}
          amountCents={recording === "deposit" ? Math.max(1, event.depositCents - event.payments!.filter((p) => p.subjectType === "catering_deposit" && !p.voidedAt).reduce((a, p) => a + p.amountCents, 0)) : Math.max(1, event.balanceCents)}
          note={recording === "deposit" ? "Check the deposit in your bank first. Marking it paid confirms the event." : "Check the payment in your bank first. A fully paid balance marks the invoice paid."}
          onClose={() => setRecording(null)}
          onRecord={async (body) => {
            const r = recording === "deposit" ? await api.catering.markDepositPaid(event.id, body) : await api.catering.recordBalance(event.id, body);
            onChange(r);
            return r;
          }}
          successMessage={recording === "deposit" ? "Deposit recorded" : "Payment recorded"}
        />
      ) : null}

      {st === "confirmed" || st === "completed" ? (
        <Section title="Balance invoice" description={event.invoiceId ? "An invoice exists for this event." : `Bill the ${formatMoney(event.depositPaidAt ? event.balanceCents : event.totalCents)} left after the deposit.`}>
          {invoice ? (
            <div className="flex flex-col gap-1 text-meta">
              <p className="text-fg">Invoice #{invoice.number} for {formatMoney(invoice.amountDueCents)}</p>
              {invoice.payUrl ? <a href={invoice.payUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-fg underline underline-offset-4">Open pay link <ExternalLink aria-hidden className="size-3" /></a> : null}
            </div>
          ) : !event.invoiceId ? (
            <>
              <CheckRow checked={sendInvoice} onChange={setSendInvoice} label="Send it to the customer now" />
              <div><Button size="sm" variant="secondary" loading={act.busy} onClick={() => void doing(() => api.catering.invoice(event.id, sendInvoice), "Invoice created", (r) => { setInvoice(r); onChange({ ...event, invoiceId: r.id }); })}>Create balance invoice</Button></div>
            </>
          ) : null}
        </Section>
      ) : null}

      {banquetOn && !closed ? (
        <Section title="Banquet hall" description={event.hallBookingId ? "Linked to a hall booking." : "Hold a hall, then link the booking here."}>
          {event.hallBookingId ? (
            <Link href={`${base}/restaurant/banquet?tab=bookings`} className="text-meta font-medium text-fg underline underline-offset-4">See the booking</Link>
          ) : openBookings.length ? (
            <>
              <Select label="Hall booking" value={hallPick} placeholder="Choose a booking" onChange={(e) => setHallPick(e.target.value)} options={openBookings.map((b) => ({ value: b.id, label: `${b.hallName ?? "Hall"}, ${dayLabel(b.startsAt.slice(0, 10))}, ${b.headcount} guests` }))} />
              <div><Button size="sm" variant="secondary" disabled={!hallPick} loading={act.busy} onClick={() => void doing(() => api.catering.linkHall(event.id, hallPick), "Hall booking linked", ev)}>Link booking</Button></div>
            </>
          ) : (
            <p className="text-meta text-fg-muted">No open hall bookings. <Link href={`${base}/restaurant/banquet?tab=bookings`} className="text-fg underline underline-offset-4">Hold a hall</Link> first.</p>
          )}
        </Section>
      ) : null}

      {!closed ? (
        <Section title="Close out">
          <div className="flex flex-wrap gap-2">
            {st === "confirmed" ? <Button size="sm" loading={act.busy} onClick={() => void doing(() => api.catering.complete(event.id), "Event completed", ev)}>Mark completed</Button> : null}
            <Button size="sm" variant="ghost" onClick={() => setCancelling(true)}>Cancel event</Button>
          </div>
        </Section>
      ) : null}

      <ConfirmDialog
        open={cancelling}
        onClose={() => { setCancelling(false); setRefund(NO_REFUND); }}
        danger
        title={`Cancel ${EVENT_TYPE_LABEL[event.eventType].toLowerCase()}?`}
        body={`${event.hallBookingId ? "The linked hall booking is released. " : ""}The customer is told it was cancelled${refundable ? ", and what happens to their deposit" : ""}.`}
        confirmLabel={refund.mode === "none" ? "Cancel event" : "Cancel and refund"}
        disabled={refundable && refundBody(refund, event.depositCents) === null}
        onConfirm={async () => {
          const choice = refundable ? refundBody(refund, event.depositCents) : null;
          const r = await api.catering.cancel(event.id, reason.trim() || undefined, choice ?? undefined);
          toast({ message: r.depositRefundCents > 0 ? `Event cancelled. ${formatMoney(r.depositRefundCents)} is on its way back.` : "Event cancelled", tone: "success" });
          setRefund(NO_REFUND);
          onChange(r);
        }}
      >
        <TextField label="Reason" optionalLabel value={reason} onChange={(e) => setReason(e.target.value)} />
        {refundable ? <RefundChoice depositCents={event.depositCents} value={refund} onChange={setRefund} hint="If you took the deposit by e-transfer or cash, keep it here and return it yourself. The app can only refund card payments." /> : event.depositPaidAt && event.depositRefundCents === 0 ? <p className="mt-3 text-meta text-fg-muted">The deposit is not refunded automatically.</p> : null}
      </ConfirmDialog>
    </>
  );
}

const METHOD_WORD: Record<string, string> = { etransfer: "e-transfer", cash: "cash", cheque: "cheque", other: "other", card: "card" };

/** The payments ledger (design C2): deposit and balance, what the customer was told, and a Record payment button. */
function PaymentsCard({ event, payee, onRecord }: { event: Ev; payee: { etransferEnabled: boolean; etransferEmail: string | null } | null; onRecord: (k: "deposit" | "balance") => void }) {
  const st = event.status;
  if (!event.totalCents || st === "cancelled" || st === "inquiry" || st === "tasting") return null;
  const dep = (event.payments ?? []).filter((p) => p.subjectType === "catering_deposit");
  const bal = (event.payments ?? []).filter((p) => p.subjectType === "catering_balance");
  const live = (xs: typeof dep) => xs.filter((p) => !p.voidedAt);
  const depositDue = st === "quoted" && !!event.approvedAt && !event.depositPaidAt && event.depositCents > 0;
  const balanceDue = (st === "confirmed" || st === "completed") && event.balanceCents > 0;
  const told = payee?.etransferEnabled && payee.etransferEmail && event.referenceCode && depositDue;
  return (
    <section aria-label="Payments" className="rounded-card border border-line p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-headline text-fg">Payments</h2>
        {depositDue || balanceDue ? <Button size="sm" variant="secondary" onClick={() => onRecord(depositDue ? "deposit" : "balance")}>Record payment</Button> : null}
      </div>
      <ul className="mt-3 divide-y divide-line border-t border-line">
        <li className="flex items-start justify-between gap-3 py-3">
          <div className="min-w-0">
            <p className="text-body-strong text-fg">Deposit ({bpsToPct(event.depositBps)})</p>
            <p className="mt-0.5 flex items-center gap-1.5 text-meta text-fg-muted">
              <span aria-hidden className={`size-1.5 rounded-full ${event.depositPaidAt ? "bg-positive" : depositDue ? "bg-location" : "bg-fg-subtle"}`} />
              {event.depositPaidAt ? `Paid${event.depositMethod ? ` by ${METHOD_WORD[event.depositMethod] ?? event.depositMethod}` : ""}${event.depositReceivedOn ? ` ${dayLabel(event.depositReceivedOn)}` : ""}` : depositDue ? `Awaiting${event.referenceCode ? ` e-transfer · reference ${event.referenceCode}` : ""}` : "After the customer approves"}
            </p>
            {live(dep).map((p) => (
              <p key={p.id} className="ps-3 text-caption text-fg-muted">{formatMoney(p.amountCents)} {METHOD_WORD[p.method]} {dayLabel(p.receivedOn)}{p.bankReference ? ` · ${p.bankReference}` : ""}</p>
            ))}
          </div>
          <p className="shrink-0 text-body tabular text-fg">{formatMoney(event.depositCents)}</p>
        </li>
        <li className="flex items-start justify-between gap-3 py-3">
          <div className="min-w-0">
            <p className="text-body-strong text-fg">Balance</p>
            <p className="mt-0.5 flex items-center gap-1.5 text-meta text-fg-muted">
              <span aria-hidden className={`size-1.5 rounded-full ${event.balanceCents === 0 && event.depositPaidAt ? "bg-positive" : "bg-fg-subtle"}`} />
              {event.balanceCents === 0 && event.depositPaidAt ? "Paid in full" : event.invoiceId ? "Invoice sent" : "Invoice after the event"}
            </p>
            {live(bal).map((p) => (
              <p key={p.id} className="ps-3 text-caption text-fg-muted">{formatMoney(p.amountCents)} {METHOD_WORD[p.method]} {dayLabel(p.receivedOn)}{p.bankReference ? ` · ${p.bankReference}` : ""}</p>
            ))}
          </div>
          <p className="shrink-0 text-body tabular text-fg">{formatMoney(Math.max(0, event.totalCents - event.depositCents))}</p>
        </li>
      </ul>
      {told ? <Banner tone="info" className="mt-3">Customer was told to send {formatMoney(event.depositCents)} to {payee!.etransferEmail} with {event.referenceCode} in the message.</Banner> : null}
    </section>
  );
}
