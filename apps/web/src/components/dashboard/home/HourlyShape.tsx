"use client";
import type { reportsApi } from "@ll/shared";
import { cn } from "@/lib/cn";
import { barHeights, hourTick, promoHours, windowLabel, type HomeMode } from "@/lib/dashboard/home";

/**
 * Twelve columns, 7 am to 6 pm. Grey = a typical weekday (mean of the last four), black = today (close mode only).
 * The promo's hours sit on an accent-soft band. A hidden table carries the numbers for screen readers.
 */
export function HourlyShape({ mode, hourly, weekday, promo }: { mode: HomeMode; hourly: reportsApi.TodayReportDto["hourly"]; weekday: string; promo?: { title: string; startTime: string | null; endTime: string | null } | null }) {
  const showToday = mode === "close";
  const [typical, today] = barHeights(showToday ? [hourly.typical, hourly.today] : [hourly.typical]);
  const band = new Set(promo ? promoHours(promo.startTime, promo.endTime, hourly.hours) : []);
  const title = showToday ? `Today by hour, against a typical ${weekday}` : `A typical ${weekday} by hour`;
  return (
    <section aria-label={title} className="flex flex-col gap-3.5 rounded-card border border-line p-5">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 className="text-[15px] font-semibold text-fg">{title}</h2>
        <div className="flex flex-wrap items-center gap-4 text-[13px] text-fg-muted">
          {showToday ? (
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="size-[7px] rounded-full bg-fg" /> Today
            </span>
          ) : null}
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="size-[7px] rounded-full bg-fg-subtle/50" /> Typical {weekday} (4-week avg)
          </span>
          {promo ? <span className="rounded-[6px] bg-accent-soft px-2 py-[3px] text-[12px] font-medium text-accent-text">{promo.title.replace(/^Double stamps.*/i, `Double stamps ${windowLabel(promo.startTime, promo.endTime)}`)}</span> : null}
        </div>
      </div>
      <div aria-hidden className="flex h-[190px] items-start gap-1.5">
        {hourly.hours.map((h, i) => (
          <div key={h} className={cn("flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5 rounded-[8px] py-1.5", band.has(h) && "bg-accent-soft")}>
            <div className="flex h-[140px] items-end gap-[3px]">
              <div className={cn("rounded-[3px] bg-fg-subtle/50", showToday ? "w-[17px]" : "w-[30px]")} style={{ height: `${typical![i]}px` }} />
              {showToday ? <div className="w-[17px] rounded-[3px] bg-fg" style={{ height: `${today![i]}px` }} /> : null}
            </div>
            <span className="text-[11px] text-fg-muted">{hourTick(h)}</span>
          </div>
        ))}
      </div>
      <div className="sr-only">
        <table>
        <caption>{title}</caption>
        <thead>
          <tr>
            <th scope="col">Hour</th>
            <th scope="col">Typical {weekday}</th>
            {showToday ? <th scope="col">Today</th> : null}
          </tr>
        </thead>
        <tbody>
          {hourly.hours.map((h, i) => (
            <tr key={h}>
              <th scope="row">{h > 12 ? `${h - 12} pm` : h === 12 ? "12 pm" : `${h} am`}</th>
              <td>{hourly.typical[i]}</td>
              {showToday ? <td>{hourly.today[i]}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </section>
  );
}
