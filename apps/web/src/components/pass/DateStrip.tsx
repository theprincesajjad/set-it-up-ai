"use client";
/**
 * Wave Q (customer): the booking day strip, shared by booking and rescheduling. Two weeks of day chips in the shop's colour (a dot under the
 * days that have times, "Today" on today), the month over it, and "More dates" that opens the kit's DayCalendar (react-day-picker, loaded on
 * first open) in a bottom sheet for anything later. The chips keep `role=group` + `aria-pressed` (e2e specs and the waitlist rely on them);
 * the "More dates" button sits outside the group.
 */
import { CalendarDays } from "lucide-react";
import dynamic from "next/dynamic";
import { useRef, useState, type CSSProperties } from "react";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/cn";
import { useLocaleOrEnglish } from "@/lib/i18n/client";
import { dayDate, todayIso } from "@/lib/restaurant/util";

const DayCalendar = dynamic(() => import("@/components/ui/DatePicker").then((m) => m.DayCalendar), { ssr: false, loading: () => <Skeleton className="mx-auto h-90 w-full max-w-85 rounded-card" /> });

/** How far ahead the calendar lets a customer look (the API answers 31 days per request; we ask for two weeks from the picked day). */
export const LATER_DAYS = 90;

const TRADE_VARS = ["--trade", "--trade-foreground", "--trade-soft", "--trade-deep", "--trade-pass-from", "--trade-pass-text"];

export interface DayState {
  /** Times open that day (null while unknown). */
  count: number | null;
  disabled: boolean;
  /** A working day with no times left: says "Full" (the waitlist opens from it). */
  full?: boolean;
}

const toLocal = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y!, m! - 1, d!);
};
const toIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function DateStrip({ days, day, onSelect, state, label, onPickLater, className }: { days: string[]; day: string; onSelect: (iso: string) => void; state: (iso: string) => DayState; /** Names the group ("Pick a time"). */ label: string; /** A day picked in the calendar (any day from today to LATER_DAYS ahead). */ onPickLater?: (iso: string) => void; className?: string }) {
  const { t, date } = useLocaleOrEnglish();
  const [open, setOpen] = useState(false);
  // The sheet is portalled to <body>, outside the page's shopColorProps scope: carry the shop's colour variables over to it.
  const rootRef = useRef<HTMLDivElement>(null);
  const [vars, setVars] = useState<CSSProperties>({});
  const openCalendar = () => {
    if (rootRef.current) {
      const cs = getComputedStyle(rootRef.current);
      setVars(Object.fromEntries(TRADE_VARS.map((v) => [v, cs.getPropertyValue(v).trim()]).filter(([, x]) => x)) as CSSProperties);
    }
    setOpen(true);
  };
  const today = todayIso();
  const month = date(dayDate(day), { month: "long", year: "numeric" }, "UTC");
  const first = toLocal(today);
  const last = new Date(first);
  last.setDate(last.getDate() + LATER_DAYS);
  return (
    <div ref={rootRef} className={cn("flex flex-col gap-2", className)}>
      <div className="flex min-h-11 items-center justify-between gap-3">
        <p className="text-body-strong text-fg" aria-live="polite">{month}</p>
        {onPickLater ? (
          <button type="button" onClick={openCalendar} aria-haspopup="dialog" className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-meta-strong text-trade-deep hover:bg-trade-soft focus-visible:focus-ring clear:text-foreground">
            <CalendarDays aria-hidden className="size-4.5" strokeWidth={1.8} />
            {t("cust.bk.moreDates")}
          </button>
        ) : null}
      </div>
      <div role="group" aria-label={label} className="no-scrollbar -mx-4 flex snap-x scroll-px-4 gap-2 overflow-x-auto px-4 pb-1">
        {days.map((d) => {
          const s = state(d);
          const on = d === day;
          const empty = s.count === 0;
          return (
            <button
              key={d}
              type="button"
              aria-pressed={on}
              disabled={s.disabled}
              onClick={() => onSelect(d)}
              className={cn(
                "relative flex h-19 w-15 shrink-0 snap-start flex-col items-center justify-center gap-0.5 rounded-r4 border transition-[background-color,border-color,box-shadow,transform] duration-200 focus-visible:focus-ring motion-safe:active:scale-95 disabled:cursor-not-allowed",
                on ? "border-trade bg-trade text-trade-foreground shadow-card" : "border-line bg-card text-fg hover:border-trade/50 hover:bg-trade-soft",
                !on && empty && "border-dashed bg-transparent text-fg-subtle hover:border-line hover:bg-transparent",
              )}
            >
              <span className={cn("text-caption", on ? "opacity-90" : "text-fg-muted", !on && empty && "text-fg-subtle")}>{d === today ? t("kit.today") : date(dayDate(d), { weekday: "short" }, "UTC")}</span>
              <span className="text-title tabular-nums">{date(dayDate(d), { day: "numeric" }, "UTC")}</span>
              {s.full ? <span className="text-caption leading-none">{t("wl.full")}</span> : <span aria-hidden className={cn("size-1.5 rounded-full", s.count ? (on ? "bg-trade-foreground" : "bg-trade") : "bg-transparent")} />}
            </button>
          );
        })}
      </div>
      {onPickLater ? (
        <Modal open={open} onClose={() => setOpen(false)} title={t("cust.bk.pickDate")} description={t("cust.bk.pickDateSub")} variant="sheet">
          <div className="flex justify-center pb-2" style={vars}>
            {open ? (
              <DayCalendar
                mode="single"
                tone="trade"
                selected={toLocal(day)}
                defaultMonth={toLocal(day)}
                startMonth={first}
                endMonth={last}
                disabled={[{ before: first }, { after: last }]}
                onSelect={(d: Date | undefined) => {
                  if (!d) return;
                  setOpen(false);
                  onPickLater(toIso(d));
                }}
                className="w-full max-w-90 bg-transparent p-0"
                autoFocus
              />
            ) : null}
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
