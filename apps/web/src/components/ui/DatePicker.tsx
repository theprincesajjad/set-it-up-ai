"use client";
/**
 * Kit (wave Q): dates. The shadcn Calendar (react-day-picker 10.0.2) with 44px days, the active language's month and weekday names
 * (Intl, so Urdu, Hindi and Punjabi work without date-fns locale bundles), right-to-left in Urdu, and the shop's colour on the chosen day
 * under shopColorProps (`tone="trade"`).
 *
 *   <DayCalendar selected={day} onSelect={setDay} disabled={{ before: new Date() }} tone="trade" />       inline month (booking)
 *   <DatePicker value={day} onChange={setDay} label="Promo ends" />                                     a field that opens a popover
 *   <DayCalendar mode="range" selected={range} onSelect={setRange} numberOfMonths={2} />                 a range (reports)
 *
 * Booking slot grids stay as they are (a day is picked here, a time from the slot chips). Keep `disabled` honest: closed days, past days.
 */
import { CalendarDays } from "lucide-react";
import { useState, type ComponentProps } from "react";
import { Calendar } from "@/components/primitives/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/primitives/popover";
import { cn } from "@/lib/utils";
import { useLocaleOrEnglish } from "@/lib/i18n/client";

type CalendarProps = ComponentProps<typeof Calendar>;

/** Intl formatters and labels for react-day-picker in the active language. */
function useDayPickerLocale() {
  const { t, info, dir } = useLocaleOrEnglish();
  const tag = info.bcp47;
  return {
    dir,
    formatters: {
      formatCaption: (d: Date) => new Intl.DateTimeFormat(tag, { month: "long", year: "numeric" }).format(d),
      formatWeekdayName: (d: Date) => new Intl.DateTimeFormat(tag, { weekday: "narrow" }).format(d),
      formatDay: (d: Date) => new Intl.NumberFormat(tag).format(d.getDate()),
      formatMonthDropdown: (d: Date) => new Intl.DateTimeFormat(tag, { month: "short" }).format(d),
    },
    labels: {
      labelPrevious: () => t("kit.prevMonth"),
      labelNext: () => t("kit.nextMonth"),
      labelDayButton: (d: Date, m: { today?: boolean; selected?: boolean }) =>
        `${m.today ? `${t("kit.today")}, ` : ""}${new Intl.DateTimeFormat(tag, { weekday: "long", day: "numeric", month: "long" }).format(d)}`,
    },
    tag,
  };
}

const TONE = {
  ink: "",
  // The chosen day wears the shop's colour; today keeps a ring so it is findable.
  trade:
    "[&_[data-selected-single=true]]:bg-trade [&_[data-selected-single=true]]:text-trade-foreground [&_[data-range-start=true]]:bg-trade [&_[data-range-start=true]]:text-trade-foreground [&_[data-range-end=true]]:bg-trade [&_[data-range-end=true]]:text-trade-foreground",
} as const;

export type DayCalendarProps = CalendarProps & { tone?: keyof typeof TONE };

export function DayCalendar({ tone = "ink", className, ...props }: DayCalendarProps) {
  const l = useDayPickerLocale();
  return (
    <Calendar
      dir={l.dir}
      formatters={l.formatters}
      labels={l.labels}
      className={cn("rounded-card bg-card p-3 [--cell-radius:9999px]", TONE[tone], className)}
      {...(props as CalendarProps)}
    />
  );
}

export interface DatePickerProps {
  value: Date | undefined;
  onChange: (d: Date | undefined) => void;
  label: string;
  placeholder?: string;
  disabled?: CalendarProps["disabled"];
  tone?: keyof typeof TONE;
  id?: string;
  className?: string;
}

/** A field-looking button (44px) that opens the month in a popover and closes on pick. */
export function DatePicker({ value, onChange, label, placeholder, disabled, tone = "ink", id, className }: DatePickerProps) {
  const { t, info } = useLocaleOrEnglish();
  const [open, setOpen] = useState(false);
  const text = value ? new Intl.DateTimeFormat(info.bcp47, { weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(value) : (placeholder ?? t("kit.pickDate"));
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <span id={id ? `${id}-label` : undefined} className="text-body font-[550] text-foreground">
        {label}
      </span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          id={id}
          aria-label={`${label}: ${text}`}
          className="flex h-11 w-full items-center gap-2 rounded-r3 border border-border bg-card px-3 text-start text-body text-foreground hover:bg-hover focus-visible:focus-ring data-popup-open:border-foreground"
        >
          <CalendarDays aria-hidden className="size-4.5 shrink-0 text-muted-foreground" strokeWidth={1.8} />
          <span className={cn("min-w-0 flex-1 truncate", !value && "text-muted-foreground")}>{text}</span>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-0">
          <DayCalendar
            mode="single"
            selected={value}
            onSelect={(d: Date | undefined) => {
              onChange(d);
              setOpen(false);
            }}
            disabled={disabled}
            tone={tone}
            autoFocus
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
