"use client";
import { CalendarPlus } from "lucide-react";
import { useState } from "react";
import type { commerceApi } from "@ll/shared";
import { FeatureGate } from "@/components/dashboard/FeatureGate";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/Layout";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
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
  const [kind, setKind] = useState<commerceApi.SlotKind>(kinds[0]?.value ?? "pickup");
  const [loc, setLoc] = useState(detail.locations[0]?.id ?? "");
  const [days, setDays] = useState("7");
  const [mins, setMins] = useState("15");
  const [cap, setCap] = useState("4");
  const slots = useApi(() => api.slots({ kind, locationId: loc || undefined }), [api, kind, loc]);
  const bookings = useApi(() => api.bookings({ kind }), [api, kind]);
  const act = useAction();
  const byDay = new Map<string, commerceApi.SlotDto[]>();
  for (const s of slots.data?.items ?? []) {
    const k = formatDate(s.startsAt, true);
    byDay.set(k, [...(byDay.get(k) ?? []), s]);
  }
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Pickup & drop-off" description="Slots come from your opening hours. Customers pick one when they order or book." actions={kinds.length > 1 ? <SegmentedControl label="Kind" value={kind} onChange={setKind} options={kinds} /> : undefined} />
      <Card padding="lg">
        <CardHeader title="Make slots" />
        <div className="grid gap-3 sm:grid-cols-4">
          <Select label="Location" value={loc} onChange={(e) => setLoc(e.target.value)} options={detail.locations.map((l) => ({ value: l.id, label: l.name }))} />
          <TextField label="Days ahead" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, ""))} />
          <TextField label="Slot length" inputMode="numeric" suffix="min" value={mins} onChange={(e) => setMins(e.target.value.replace(/\D/g, ""))} />
          <TextField label="Per slot" inputMode="numeric" value={cap} onChange={(e) => setCap(e.target.value.replace(/\D/g, ""))} />
        </div>
        {act.error ? <Banner tone="danger" className="mt-3">{act.error}</Banner> : null}
        <Button className="mt-3" iconStart={CalendarPlus} loading={act.busy} onClick={async () => {
          const r = await act.run(() => api.generateSlots({ locationId: loc, kind, startDate: toLocalInput(new Date()).slice(0, 10), days: Number(days) || 7, slotMinutes: Number(mins) || 15, capacity: Number(cap) || 4 }));
          if (r) {
            toast({ message: `${r.created} slots added`, tone: "success" });
            await slots.reload();
          }
        }}>
          Make slots
        </Button>
      </Card>
      <Card padding="lg">
        <CardHeader title="Upcoming bookings" />
        {bookings.data?.items.length ? (
          <ul className="divide-y divide-line">
            {bookings.data.items.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center gap-3 py-2 text-meta">
                <span className="min-w-40 flex-1 text-fg">{formatDate(b.startsAt, true)} {formatTime(b.startsAt)} · {b.status}</span>
                {b.status === "booked" ? (
                  <>
                    <Button size="sm" variant="secondary" onClick={async () => { await act.run(() => api.updateBooking(b.id, "completed")); await bookings.reload(); }}>Done</Button>
                    <Button size="sm" variant="ghost" onClick={async () => { await act.run(() => api.updateBooking(b.id, "no_show")); await bookings.reload(); }}>No-show</Button>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-meta text-fg-muted">No bookings yet.</p>
        )}
      </Card>
      <Card padding="lg">
        <CardHeader title="Slots" />
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
        {!byDay.size ? <p className="text-meta text-fg-muted">No slots yet. Make some above.</p> : null}
      </Card>
    </div>
  );
}
