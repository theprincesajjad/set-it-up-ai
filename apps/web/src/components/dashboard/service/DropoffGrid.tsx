import type { commerceApi } from "@ll/shared";
import { Panel } from "@/components/dashboard/kit";
import { cn } from "@/lib/cn";
import { buildGrid, cellKey, hourLabel } from "@/lib/dashboard/dropoff";

/** Next 7 days by hour: booked of capacity, with a thin bar. "Full" and "Closed" are words, not colours. */
export function DropoffGrid({ slots, tz, now, loading, title = "Next 7 days" }: { slots: commerceApi.SlotDto[]; tz: string; now: Date; loading?: boolean; title?: string }) {
  const g = buildGrid(slots, tz, now);
  return (
    <Panel
      title={title}
      action={
        <span className="hidden items-center gap-3 text-caption text-fg-muted sm:flex" aria-hidden>
          <span className="inline-flex items-center gap-1"><span className="size-1.5 rounded-full bg-fg" />Booked</span>
          <span className="inline-flex items-center gap-1"><span className="size-1.5 rounded-full bg-bg-muted" />Free</span>
          <span className="inline-flex items-center gap-1"><span className="size-1.5 rounded-full bg-fg-subtle" />Full</span>
        </span>
      }
    >
      {!g.hours.length ? (
        <p className="py-6 text-meta text-fg-muted">{loading ? "Loading slots…" : "No slots open in the next 7 days."}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-separate border-spacing-1 text-center text-meta" aria-label="Drop-off slots by day and hour">
            <thead>
              <tr>
                <th scope="col" className="w-12" />
                {g.days.map((d) => (
                  <th key={d.date} scope="col" className="pb-1 text-meta-strong text-fg">{d.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {g.hours.map((h) => (
                <tr key={h}>
                  <th scope="row" className="pe-2 text-end text-caption font-normal text-fg-muted">{hourLabel(h)}</th>
                  {g.days.map((d) => {
                    const c = g.cells[cellKey(d.date, h)];
                    if (!c) return <td key={d.date} className="h-9 rounded-input bg-bg-subtle text-caption text-fg-muted">Closed</td>;
                    const pct = c.capacity ? Math.min(100, Math.round((c.booked / c.capacity) * 100)) : 0;
                    return (
                      <td key={d.date} className={cn("relative h-9 rounded-input px-1", c.state === "full" ? "bg-bg-muted text-fg-muted" : "bg-bg-subtle text-fg")}>
                        <span className="tabular">{c.state === "full" ? "Full" : `${c.booked} of ${c.capacity}`}</span>
                        <span aria-hidden className="absolute inset-x-1.5 bottom-1 h-0.5 rounded-full bg-line">
                          <span className={cn("block h-full rounded-full", c.state === "full" ? "bg-fg-subtle" : "bg-fg")} style={{ width: `${pct}%` }} />
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
