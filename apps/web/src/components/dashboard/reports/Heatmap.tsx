"use client";
import type { reportsApi } from "@ll/shared";
import { HEAT_DAYS, HEAT_HOURS, heatInk, visitsOutsideWindow } from "@/lib/dashboard/reports";

const hourLabel = (h: number) => (h > 12 ? String(h - 12) : String(h));

/**
 * When people come in: weekday by hour in shop time, darker is busier (monochrome ramp, no legend colours to learn).
 * A hidden table carries every number for screen readers.
 */
export function Heatmap({ data, note }: { data: reportsApi.HeatmapReport; note?: string }) {
  const outside = visitsOutsideWindow(data.matrix);
  return (
    <section aria-label="When people come in" className="min-w-0 rounded-card border border-line p-6">
      <h2 className="text-[16px] font-semibold text-fg">When people come in</h2>
      <div aria-hidden className="mt-4 overflow-x-auto">
        <div className="grid min-w-[480px] gap-1" style={{ gridTemplateColumns: "34px repeat(12, minmax(0, 1fr))" }}>
          <span />
          {HEAT_HOURS.map((h) => (
            <span key={h} className="text-center text-[11px] text-fg-muted">{hourLabel(h)}</span>
          ))}
          {HEAT_DAYS.map((day, d) => (
            <div key={day} className="contents">
              <span className="flex items-center text-[11px] text-fg-muted">{day}</span>
              {HEAT_HOURS.map((h) => {
                const n = data.matrix[d]?.[h] ?? 0;
                return <span key={h} title={`${day} ${h > 12 ? h - 12 : h}${h >= 12 ? " pm" : " am"}: ${n}`} className="h-[26px] rounded-[4px]" style={{ backgroundColor: `color-mix(in srgb, var(--ll-color-fg) ${heatInk(n, data.max)}%, var(--ll-color-bg))` }} />;
              })}
            </div>
          ))}
        </div>
      </div>
      <p className="mt-4 text-[12px] text-fg-muted">
        Darker is busier.{note ? ` ${note}` : ""}
        {outside > 0 ? ` ${outside} ${outside === 1 ? "visit" : "visits"} outside 7 am to 7 pm are not shown.` : ""}
      </p>
      <div className="sr-only">
        <table>
        <caption>Visits by weekday and hour, last {data.weeks} weeks</caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            {HEAT_HOURS.map((h) => (
              <th key={h} scope="col">{h > 12 ? `${h - 12} pm` : h === 12 ? "12 pm" : `${h} am`}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {HEAT_DAYS.map((day, d) => (
            <tr key={day}>
              <th scope="row">{day}</th>
              {HEAT_HOURS.map((h) => (
                <td key={h}>{data.matrix[d]?.[h] ?? 0}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </section>
  );
}
