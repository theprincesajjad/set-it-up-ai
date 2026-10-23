"use client";
import { ErrorLine, PageHeader, Panel, Segmented, SkeletonRows } from "@/components/dashboard/kit";
import { CalendarPlus } from "lucide-react";
import { useState } from "react";
import type { commerceApi } from "@ll/shared";
import { FeatureGate } from "@/components/dashboard/FeatureGate";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { formatDate, formatTime } from "@/lib/format";
import { toLocalInput } from "@/lib/dashboard/time";
import { useAction, useApi } from "@/lib/dashboard/useApi";

export default function SlotsPage() {
  return (
    <FeatureGate keys={["booking.pickup_slots", "booking.dropoff_scheduling"]} title="Pickup & drop-off slots">
      <Slots />
    </FeatureGate>
  );
}

function Slots() {
  const { api, detail, enabled } = useMerchant();
  const toast = useToast();
  const kinds = [...(enabled("booking.pickup_slots") ? [{ value: "pickup" as const, label: "Pickup" }] : []), ...(enabled("booking.dropoff_scheduling") ? [{ value: "dropoff" as const, label: "Drop-off" }] : [])];
  // Repair shops book drop-offs first; everyone else starts on pickup.
  const [kind, setKind] = useState<commerceApi.SlotKind>(enabled("service.tickets") && enabled("booking.dropoff_scheduling") ? "dropoff" : (kinds[0]?.value ?? "pickup"));
  const [loc, setLoc] = useState(detail.locations[0]?.id ?? "");
  const [days, setDays] = useState("7");
  const [mins, setMins] = useState("15");
  const [cap, setCap] = useState("4");
  const slots = useApi(() => api.slots({ kind, locationId: loc || undefined }), [api, kind, loc]);
  const bookings = useApi(() => api.bookings({ kind }), [api, kind]);
  const act = useAction();
  const [tried, setTried] = useState(false);
  const bound = (v: string, min: number, max: number, msg: string) => (!v || Number(v) < min || Number(v) > max ? msg : undefined);
  const errs = { days: bound(days, 1, 31, "Use 1 to 31 days."), mins: bound(mins, 5, 240, "Use 5 to 240 minutes."), cap: bound(cap, 1, 100, "Use 1 to 100.") };
  const byDay = new Map<string, commerceApi.SlotDto[]>();
  for (const s of slots.data?.items ?? []) {
    const k = formatDate(s.startsAt, true);
    byDay.set(k, [...(byDay.get(k) ?? []), s]);
  }
  return (
    <div className="flex flex-col gap-6">
      <PageHeader flush title="Pickup & drop-off" description="Slots come from your opening hours. Customers pick one when they order or book." actions={kinds.length > 1 ? <Segmented label="Kind" value={kind} onChange={setKind} options={kinds} /> : undefined} />
      <Panel title="Make slots">
        <div className="grid gap-4 sm:grid-cols-4">
          <Select label="Location" value={loc} onChange={(e) => setLoc(e.target.value)} options={detail.locations.map((l) => ({ value: l.id, label: l.name }))} />
          <TextField label="Days ahead" inputMode="numeric" error={tried ? errs.days : undefined} value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, ""))} />
          <TextField label="Slot length" inputMode="numeric" suffix="min" error={tried ? errs.mins : undefined} value={mins} onChange={(e) => setMins(e.target.value.replace(/\D/g, ""))} />
          <TextField label="Per slot" inputMode="numeric" hint="Bookings per slot." error={tried ? errs.cap : undefined} value={cap} onChange={(e) => setCap(e.target.value.replace(/\D/g, ""))} />
        </div>
        {act.error ? <Banner tone="danger" className="mt-3">{act.error}</Banner> : null}
        <Button className="mt-4" iconStart={CalendarPlus} loading={act.busy} onClick={async () => {
          setTried(true);
          if (errs.days || errs.mins || errs.cap) return;
          const r = await act.run(() => api.generateSlots({ locationId: loc, kind, startDate: toLocalInput(new Date()).slice(0, 10), days: Number(days), slotMinutes: Number(mins), capacity: Number(cap) }));
          if (r) {
            toast({ message: `${r.created} slots added`, tone: "success" });
            await slots.reload();
          }
        }}>
          Make slots
        </Button>
      </Panel>
      <Panel title="Upcoming bookings">
        {bookings.error && !bookings.data ? (
          <ErrorLine message={bookings.error} onRetry={bookings.reload} />
        ) : !bookings.data ? (
          <SkeletonRows rows={2} />
        ) : bookings.data.items.length ? (
          <ul className="divide-y divide-line">
            {bookings.data.items.map((b) => (
              <li key={b.id} className="flex items-center gap-3 py-3 text-meta">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body text-fg">{b.customerName ?? "Customer"}{b.orderNumber ? ` · Order #${b.orderNumber}` : b.ticketNumber ? ` · Ticket #${b.ticketNumber}` : ""}</span>
                  <span className="block truncate text-fg-muted tabular">{formatDate(b.startsAt, true)} {formatTime(b.startsAt)}{b.status === "booked" ? "" : ` · ${b.status.replace(/_/g, " ")}`}{b.notes ? ` · ${b.notes}` : ""}</span>
                </span>
                {b.status === "booked" ? (
                  <div className="flex shrink-0 items-center gap-1">
                    <Button size="sm" variant="secondary" onClick={async () => { await act.run(() => api.updateBooking(b.id, "completed")); await bookings.reload(); }}>Done</Button>
                    <Button size="sm" variant="ghost" onClick={async () => { await act.run(() => api.updateBooking(b.id, "no_show")); await bookings.reload(); }}>No-show</Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-meta text-fg-muted">No bookings yet.</p>
        )}
      </Panel>
      <Panel title="Slots" description="Places left of the total, per time.">
        {slots.error && !slots.data ? <ErrorLine message={slots.error} onRetry={slots.reload} /> : null}
        {[...byDay.entries()].slice(0, 7).map(([day, list]) => (
          <div key={day} className="mb-3">
            <p className="text-label text-fg">{day}</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {list.map((s) => (
                <span key={s.id} className="inline-flex h-8 items-center rounded-full border border-line px-2.5 text-caption tabular-nums text-fg">
                  {formatTime(s.startsAt)} · {s.remaining}/{s.capacity}
                </span>
              ))}
            </div>
          </div>
        ))}
        {!byDay.size && slots.data ? <p className="text-meta text-fg-muted">No slots yet. Make some above.</p> : null}
      </Panel>
    </div>
  );
}
