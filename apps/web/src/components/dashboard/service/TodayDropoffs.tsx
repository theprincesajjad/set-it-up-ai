import type { commerceApi } from "@ll/shared";
import { Dot, Panel } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/Button";
import { clock12, todaysBookings } from "@/lib/dashboard/dropoff";

type Booking = commerceApi.BookingDto;

/** Today's drop-offs. Check in opens intake with the customer and what they said they are bringing already filled in. */
export function TodayDropoffs({ bookings, tz, now, base, onNoShow }: { bookings: Booking[]; tz: string; now: Date; base: string; onNoShow: (id: string) => void }) {
  const list = todaysBookings(bookings, tz, now);
  return (
    <Panel title={`Today: ${list.length} ${list.length === 1 ? "drop-off" : "drop-offs"} booked`} action={<span className="hidden text-meta text-fg-muted sm:inline">Tap check in to open intake with the customer already filled in</span>}>
      {list.length ? (
        <ul className="divide-y divide-line">
          {list.map((b) => {
            const late = b.status === "booked" && new Date(b.startsAt).getTime() + 15 * 60_000 < now.getTime();
            return (
              <li key={b.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3">
                <span className="w-16 shrink-0 text-body-strong tabular text-fg">{clock12(b.startsAt, tz)}</span>
                <span className="w-36 shrink-0 truncate text-body text-fg">{b.customerName ?? "Customer"}</span>
                <span className="min-w-0 flex-1 truncate text-meta text-fg-muted">{b.notes ?? ""}</span>
                {b.status === "completed" ? <Dot tone="positive">{b.ticketNumber ? `Checked in as #${b.ticketNumber}` : "Done"}</Dot> : null}
                {b.status === "no_show" ? <Dot tone="negative">No-show</Dot> : null}
                {b.status === "cancelled" ? <Dot tone="neutral">Cancelled</Dot> : null}
                {b.status === "booked" ? (
                  <>
                    {late ? <Dot tone="negative">Running late</Dot> : <Dot tone="info">Booked</Dot>}
                    {late ? <Button size="sm" variant="ghost" onClick={() => onNoShow(b.id)}>No-show</Button> : null}
                    <Button size="sm" variant="secondary" href={`${base}/tickets/new?bookingId=${b.id}`}>Check in</Button>
                  </>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-meta text-fg-muted">Nobody has booked a drop-off for today.</p>
      )}
    </Panel>
  );
}
