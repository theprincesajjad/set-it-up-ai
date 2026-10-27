"use client";
import { forwardRef, type MouseEvent, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { gapRange, minutesToPx, type TimeOffBlock, type WalkInGap } from "@/lib/dashboard/calendar";

/** One column of the grid (a stylist, or one day for a stylist): hour lines, shaded non-working time, time off, blocks. */
export const StaffColumn = forwardRef<
  HTMLDivElement,
  {
    label: string;
    hours: number;
    window: [number, number];
    off: [number, number][];
    timeOff: TimeOffBlock[];
    gaps?: WalkInGap[];
    onGapClick?: (g: WalkInGap) => void;
    nowMinute: number | null;
    onEmptyClick: (e: MouseEvent<HTMLDivElement>, rectTop: number) => void;
    hidden?: boolean;
    children?: ReactNode;
  }
>(function StaffColumn({ label, hours, window, off, timeOff, gaps = [], onGapClick, nowMinute, onEmptyClick, hidden, children }, ref) {
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
      {gaps.map((g) => (
        <button
          key={g.start}
          type="button"
          data-gap
          aria-label={`Open walk-in gap, ${gapRange(g)}`}
          onClick={() => onGapClick?.(g)}
          className="absolute inset-x-1 z-10 flex flex-col items-start overflow-hidden rounded-[8px] border border-dashed border-fg-subtle bg-bg px-2 py-1 text-start text-[11px] leading-4 text-fg-muted hover:bg-bg-subtle focus-visible:focus-ring"
          style={{ top: g.top, height: g.height }}
        >
          <span className="truncate font-medium">{g.height >= 44 ? "Open: walk-in gap" : "Open"}</span>
          {g.height >= 44 ? <span className="truncate">Free for walk-ins</span> : null}
          {g.height >= 58 ? <span className="truncate tabular">{gapRange(g)}</span> : null}
        </button>
      ))}
      {children}
      {nowMinute !== null ? <div aria-hidden className="pointer-events-none absolute inset-x-0 z-[5] h-0.5 bg-fg" style={{ top: minutesToPx(nowMinute - window[0]) }} /> : null}
    </div>
  );
});
