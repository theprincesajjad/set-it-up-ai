"use client";
import { forwardRef, type MouseEvent, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { minutesToPx, type TimeOffBlock } from "@/lib/dashboard/calendar";

/** One column of the grid (a stylist, or one day for a stylist): hour lines, shaded non-working time, time off, blocks. */
export const StaffColumn = forwardRef<
  HTMLDivElement,
  {
    label: string;
    hours: number;
    window: [number, number];
    off: [number, number][];
    timeOff: TimeOffBlock[];
    nowMinute: number | null;
    onEmptyClick: (e: MouseEvent<HTMLDivElement>, rectTop: number) => void;
    hidden?: boolean;
    children?: ReactNode;
  }
>(function StaffColumn({ label, hours, window, off, timeOff, nowMinute, onEmptyClick, hidden, children }, ref) {
  return (
    <div
      ref={ref}
      role="group"
      aria-label={label}
      data-column
      className={cn("relative border-s border-line first:border-s-0", hidden && "max-md:hidden")}
      style={{ height: hours * 60 }}
      onClick={(e) => {
        if (e.target !== e.currentTarget && !(e.target as HTMLElement).dataset.fill) return;
        onEmptyClick(e, e.currentTarget.getBoundingClientRect().top);
      }}
    >
      {Array.from({ length: hours }, (_, i) => (
        <div key={i} data-fill aria-hidden className="absolute inset-x-0 border-t border-line first:border-t-0" style={{ top: i * 60, height: 60 }} />
      ))}
      {off.map(([s, e], i) => (
        <div key={`off${i}`} aria-hidden data-fill className="pointer-events-none absolute inset-x-0 bg-bg-muted/70" style={{ top: minutesToPx(s - window[0]), height: minutesToPx(e - s) }} />
      ))}
      {timeOff.map((t) => (
        <div key={t.id} className="pointer-events-none absolute inset-x-1 overflow-hidden rounded-[8px] bg-bg-muted px-2 py-1 text-[11px] text-fg-muted" style={{ top: t.top, height: t.height }}>
          <p className="truncate font-medium">{t.reason || "Time off"}</p>
          <p className="truncate">Blocked</p>
        </div>
      ))}
      {children}
      {nowMinute !== null ? <div aria-hidden className="pointer-events-none absolute inset-x-0 z-30 h-0.5 bg-fg" style={{ top: minutesToPx(nowMinute - window[0]) }} /> : null}
    </div>
  );
});
