"use client";
import { CalendarPlus } from "lucide-react";
import { useState } from "react";
import type { commerceApi } from "@ll/shared";
import { FeatureGate } from "@/components/dashboard/FeatureGate";
import { EmptyState, PageHeader, Panel, Segmented, SkeletonRows } from "@/components/dashboard/kit";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { DropoffGrid } from "@/components/dashboard/service/DropoffGrid";
import { DropoffHours } from "@/components/dashboard/service/DropoffHours";
import { TodayDropoffs } from "@/components/dashboard/service/TodayDropoffs";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { formatDate, formatTime } from "@/lib/format";
import { addDaysISO } from "@/lib/dashboard/dropoff";
import { toLocalInput } from "@/lib/dashboard/time";
import { useAction, useApi, useNow } from "@/lib/dashboard/useApi";

export default function SlotsPage() {
  return (
    <FeatureGate keys={["booking.pickup_slots", "booking.dropoff_scheduling"]} title="Drop-off and pickup slots">
      <Slots />
    </FeatureGate>
  );
}

function Slots() {
  const { api, detail, enabled } = useMerchant();
  const kinds = [...(enabled("booking.dropoff_scheduling") ? [{ value: "dropoff" as const, label: "Drop-off" }] : []), ...(enabled("booking.pickup_slots") ? [{ value: "pickup" as const, label: "Pickup" }] : [])];
  const [kind, setKind] = useState<"dropoff" | "pickup">(kinds[0]?.value ?? "pickup");
  const [loc, setLoc] = useState(detail.locations[0]?.id ?? "");
  const [blockOpen, setBlockOpen] = useState(false);
  const now = new Date(useNow());
  const location = detail.locations.find((l) => l.id === loc) ?? detail.locations[0];
  const to = new Date(now.getTime() + 8 * 86_400_000).toISOString();
  const slots = useApi(() => api.slots({ kind, locationId: loc || undefined, from: now.toISOString(), to }), [api, kind, loc], { pollMs: 60_000 });
  const bookings = useApi(() => api.bookings({ kind, from: new Date(now.getTime() - 86_400_000).toISOString() }), [api, kind], { pollMs: 60_000 });
  const settings = useApi(kind === "dropoff" ? () => api.serviceOps.dropoffSettings() : null, [api, kind]);
  const act = useAction();
  const toast = useToast();
  const tz = detail.merchant.timezone;
  const hasHours = !!location?.hours && Object.values(location.hours).some((h) => h?.length);
  const noSlots = slots.data && slots.data.items.length === 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        flush
        title={kind === "dropoff" ? "Drop-off slots" : "Pickup slots"}
        description={kind === "dropoff" ? "Customers book a time to bring the item in. Slots follow your opening hours and fill up on their own." : "Customers pick a pickup time when they order. Slots come from your opening hours."}
        actions={
          <div className="flex flex-wrap items-center gap-3">
            {detail.locations.length > 1 ? <Select label="Location" hideLabel value={loc} onChange={(e) => setLoc(e.target.value)} options={detail.locations.map((l) => ({ value: l.id, label: l.name }))} /> : null}
            {kinds.length > 1 ? <Segmented label="Kind" value={kind} onChange={setKind} options={kinds} /> : null}
            {kind === "dropoff" ? <Button size="sm" variant="secondary" onClick={() => setBlockOpen(true)}>Block a day</Button> : null}
          </div>
        }
      />
      {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
      {!slots.data ? (
        <SkeletonRows rows={6} />
      ) : noSlots && kind === "dropoff" ? (
        hasHours ? (
          <EmptyState
            title="Open drop-off slots"
            description={`Customers will see ${settings.data?.slotMinutes ?? 30}-minute slots over the next ${settings.data?.daysAhead ?? 14} days, from your opening hours, ${settings.data?.capacity ?? 3} drop-offs at a time. You can change all three after.`}
            action={
              <Button
                loading={act.busy}
                iconStart={CalendarPlus}
                onClick={async () => {
                  const r = await act.run(() => api.serviceOps.saveDropoffSettings({}));
                  if (r) {
                    toast({ message: "Drop-off slots are open", tone: "success" });
                    await Promise.all([slots.reload(), settings.reload()]);
                  }
                }}
              >
                Open the next {settings.data?.daysAhead ?? 14} days
              </Button>
            }
          />
        ) : (
          <EmptyState title="Set your opening hours first" description="Drop-off slots follow the hours on your location." action={<Button variant="secondary" href={`/m/${detail.merchant.id}/locations`}>Open Locations</Button>} />
        )
      ) : (
        <div className={kind === "dropoff" ? "grid items-start gap-6 lg:grid-cols-[340px_minmax(0,1fr)]" : "flex flex-col gap-6"}>
          {kind === "dropoff" && settings.data ? (
            <DropoffHours
              key={`${settings.data.slotMinutes}-${settings.data.capacity}-${settings.data.daysAhead}`}
              hours={location?.hours ?? null}
              settings={settings.data}
              locationsHref={`/m/${detail.merchant.id}/locations`}
              busy={act.busy}
              error={null}
              onSave={async (v) => {
                const r = await act.run(() => api.serviceOps.saveDropoffSettings(v));
                if (r) {
                  settings.setData(r);
                  toast({ message: "Saved", tone: "success" });
                  await slots.reload();
                }
              }}
              onUnblock={async (d) => {
                const r = await act.run(() => api.serviceOps.unblockDay(d));
                if (r) {
                  settings.setData(r);
                  await slots.reload();
                }
              }}
            />
          ) : null}
          <div className="flex min-w-0 flex-col gap-6">
            <DropoffGrid slots={slots.data.items} tz={tz} now={now} loading={slots.loading} />
            {kind === "dropoff" ? (
              <TodayDropoffs
                bookings={bookings.data?.items ?? []}
                tz={tz}
                now={now}
                base={`/m/${detail.merchant.id}`}
                onNoShow={async (id) => {
                  await act.run(() => api.updateBooking(id, "no_show"));
                  await bookings.reload();
                }}
              />
            ) : (
              <>
                <PickupMaker loc={loc} onMade={() => slots.reload()} />
                <UpcomingBookings bookings={bookings.data?.items ?? []} onStatus={async (id, st) => { await act.run(() => api.updateBooking(id, st)); await bookings.reload(); }} />
              </>
            )}
          </div>
        </div>
      )}
      <BlockDay
        open={blockOpen}
        onClose={() => setBlockOpen(false)}
        min={addDaysISO(new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(now), 0)}
        busy={act.busy}
        onConfirm={async (date) => {
          const r = await act.run(() => api.serviceOps.blockDay(date));
          if (r) {
            settings.setData(r.settings);
            setBlockOpen(false);
            toast({ message: r.withBookings ? `Closed. ${r.withBookings} ${r.withBookings === 1 ? "booking is" : "bookings are"} still on that day: contact those customers.` : "Closed for that day", tone: r.withBookings ? "neutral" : "success" });
            await Promise.all([slots.reload(), bookings.reload()]);
          }
        }}
      />
    </div>
  );
}

function BlockDay({ open, onClose, min, busy, onConfirm }: { open: boolean; onClose: () => void; min: string; busy: boolean; onConfirm: (date: string) => void }) {
  const [date, setDate] = useState("");
  return (
    <Modal open={open} onClose={onClose} title="Block a day" description="No new drop-offs can be booked that day. Bookings already made stay until you contact those customers." actions={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={busy} disabled={!date} onClick={() => onConfirm(date)}>Close this day</Button></>}>
      <TextField type="date" label="Day" min={min} value={date} onChange={(e) => setDate(e.target.value)} />
    </Modal>
  );
}

const inRange = (v: string, lo: number, hi: number) => v !== "" && Number(v) >= lo && Number(v) <= hi;

/** Pickup shops still create their slots here: a small form, not the whole page. */
function PickupMaker({ loc, onMade }: { loc: string; onMade: () => void }) {
  const { api } = useMerchant();
  const toast = useToast();
  const act = useAction();
  const [days, setDays] = useState("7");
  const [mins, setMins] = useState("15");
  const [cap, setCap] = useState("4");
  const [tried, setTried] = useState(false);
  const bad = { days: !inRange(days, 1, 31), mins: !inRange(mins, 5, 240), cap: !inRange(cap, 1, 100) };
  return (
    <Panel title="Make pickup slots" description="Adds slots from your opening hours. Existing slots stay.">
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField label="Days ahead" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, ""))} error={tried && bad.days ? "Use 1 to 31 days." : null} />
        <TextField label="Slot length" inputMode="numeric" suffix="min" value={mins} onChange={(e) => setMins(e.target.value.replace(/\D/g, ""))} error={tried && bad.mins ? "Use 5 to 240 minutes." : null} />
        <TextField label="Per slot" inputMode="numeric" value={cap} onChange={(e) => setCap(e.target.value.replace(/\D/g, ""))} error={tried && bad.cap ? "Use 1 to 100." : null} />
      </div>
      {act.error ? <Banner tone="danger" className="mt-3">{act.error}</Banner> : null}
      <Button
        className="mt-4"
        iconStart={CalendarPlus}
        loading={act.busy}
        onClick={async () => {
          setTried(true);
          if (bad.days || bad.mins || bad.cap) return;
          const r = await act.run(() => api.generateSlots({ locationId: loc, kind: "pickup", startDate: toLocalInput(new Date()).slice(0, 10), days: Number(days), slotMinutes: Number(mins), capacity: Number(cap) }));
          if (r) {
            toast({ message: `${r.created} slots added`, tone: "success" });
            onMade();
          }
        }}
      >
        Make slots
      </Button>
    </Panel>
  );
}

function UpcomingBookings({ bookings, onStatus }: { bookings: commerceApi.BookingDto[]; onStatus: (id: string, s: "completed" | "no_show") => void }) {
  return (
    <Panel title="Upcoming bookings">
      {bookings.length ? (
        <ul className="divide-y divide-line">
          {bookings.map((b) => (
            <li key={b.id} className="flex items-center gap-3 py-3 text-meta">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-body text-fg">{b.customerName ?? "Customer"}</span>
                <span className="block truncate tabular text-fg-muted">{formatDate(b.startsAt, true)} {formatTime(b.startsAt)}{b.orderNumber ? ` · Order #${b.orderNumber}` : ""}{b.status === "booked" ? "" : ` · ${b.status.replace(/_/g, " ")}`}{b.notes ? ` · ${b.notes}` : ""}</span>
              </span>
              {b.status === "booked" ? (
                <div className="flex shrink-0 items-center gap-1">
                  <Button size="sm" variant="secondary" onClick={() => onStatus(b.id, "completed")}>Done</Button>
                  <Button size="sm" variant="ghost" onClick={() => onStatus(b.id, "no_show")}>No-show</Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-meta text-fg-muted">No bookings yet.</p>
      )}
    </Panel>
  );
}
