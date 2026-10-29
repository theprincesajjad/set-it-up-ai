"use client";
import { useRef } from "react";
import { cn } from "@/lib/cn";

export interface WeekDay {
  /** 0 to 6, Monday first. */
  id: number;
  label: string;
  /** Spoken name ("Monday"). */
  name: string;
  off?: boolean;
}
export interface DayHours {
  start: string;
  end: string;
}

export interface WeekStripProps {
  days: WeekDay[];
  selected: number;
  onSelect: (id: number) => void;
  hours: DayHours;
  onHoursChange: (h: DayHours) => void;
  labels: { start: string; end: string; sameEveryDay: string; days: string };
  onSameEveryDay?: () => void;
  className?: string;
}

const time = "h-8 rounded-r2 border border-input bg-card px-2 text-body tabular-nums text-foreground focus-visible:focus-ring";

/**
 * Seven day chips (40 tall, segmented-control look on the track, selected white with the 1 px shadow) and below them the start and end times of
 * the selected day, with "Same every day" as a text link. Arrow keys move between days.
 */
export function WeekStrip({ days, selected, onSelect, hours, onHoursChange, labels, onSameEveryDay, className }: WeekStripProps) {
  const ref = useRef<HTMLDivElement>(null);
  const onKey = (e: React.KeyboardEvent) => {
    const rtl = ref.current ? getComputedStyle(ref.current).direction === "rtl" : false;
    const fwd = e.key === (rtl ? "ArrowLeft" : "ArrowRight");
    const back = e.key === (rtl ? "ArrowRight" : "ArrowLeft");
    if (!fwd && !back) return;
    e.preventDefault();
    const i = days.findIndex((d) => d.id === selected);
    const n = days[(i + (fwd ? 1 : -1) + days.length) % days.length]!;
    onSelect(n.id);
    ref.current?.querySelector<HTMLElement>(`[data-day="${n.id}"]`)?.focus();
  };
  return (
    <div className={className}>
      <div ref={ref} role="radiogroup" aria-label={labels.days} onKeyDown={onKey} className="flex gap-0.5 rounded-r4 bg-lg-seg-track p-0.5">
        {days.map((d) => {
          const on = d.id === selected;
          return (
            <button
              key={d.id}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={d.name}
              data-day={d.id}
              tabIndex={on ? 0 : -1}
              onClick={() => onSelect(d.id)}
              className={cn("relative h-10 min-w-0 flex-1 rounded-[10px] text-body font-[550] focus-visible:focus-ring max-md:after:absolute max-md:after:inset-x-0 max-md:after:-inset-y-0.5 max-md:after:content-['']", on ? "bg-card text-foreground shadow-[0_1px_2px_rgba(0,0,0,.12)]" : d.off ? "text-subtle-foreground" : "text-muted-foreground")}
            >
              {d.label}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-body text-muted-foreground">
          {labels.start}
          <input type="time" value={hours.start} onChange={(e) => onHoursChange({ ...hours, start: e.target.value })} className={time} />
        </label>
        <label className="flex items-center gap-2 text-body text-muted-foreground">
          {labels.end}
          <input type="time" value={hours.end} onChange={(e) => onHoursChange({ ...hours, end: e.target.value })} className={time} />
        </label>
        {onSameEveryDay ? (
          <button type="button" onClick={onSameEveryDay} className="relative ms-auto rounded-r2 text-body-strong font-[550] text-link hover:underline focus-visible:focus-ring after:absolute after:-inset-y-3 after:inset-x-0 after:content-['']">
            {labels.sameEveryDay}
          </button>
        ) : null}
      </div>
    </div>
  );
}
