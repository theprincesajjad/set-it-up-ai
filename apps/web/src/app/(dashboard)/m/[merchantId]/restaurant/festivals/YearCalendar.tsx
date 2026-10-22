"use client";
import { useState } from "react";
import { FESTIVALS, FESTIVAL_YEARS, formatFestivalDate, sendDates, type FestivalDef } from "@ll/shared";
import { Dot, Section, SegmentedControl, Sheet, Tag } from "@/components/dashboard";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { TemplateCard } from "./TemplateCard";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DOW = ["S", "M", "T", "W", "T", "F", "S"];

interface Occ {
  festival: FestivalDef;
  start: string;
  end: string;
}

function occurrences(year: number): Occ[] {
  return FESTIVALS.flatMap((festival) => {
    const d = festival.dates[String(year)];
    return d ? [{ festival, start: d.start, end: d.end ?? d.start }] : [];
  }).sort((a, b) => a.start.localeCompare(b.start));
}

const short = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-CA", { month: "short", day: "numeric", timeZone: "UTC" });

/** Whole-year view: a month grid for each month (solid = start day, shaded = days it runs, ring = lunar date to confirm) and a list under it. */
export function YearCalendar({ today }: { today: string }) {
  const thisYear = Number(today.slice(0, 4));
  const [year, setYear] = useState<number>((FESTIVAL_YEARS as readonly number[]).includes(thisYear) ? thisYear : FESTIVAL_YEARS[0]);
  const [plan, setPlan] = useState<Occ | null>(null);
  const occ = occurrences(year);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl label="Year" value={String(year)} onChange={(v) => setYear(Number(v))} options={FESTIVAL_YEARS.map((y) => ({ value: String(y), label: String(y) }))} />
        <p className="text-meta text-fg-muted">
          <span aria-hidden className="me-1 inline-block size-2.5 rounded-full border-[1.5px] border-fg align-middle" /> Ring: lunar date, confirm locally. Solid: fixed date.
        </p>
      </div>
      <div className="grid gap-x-8 gap-y-10 md:grid-cols-2 xl:grid-cols-3">
        {MONTHS.map((name, m) => {
          const first = new Date(Date.UTC(year, m, 1));
          const days = new Date(Date.UTC(year, m + 1, 0)).getUTCDate();
          const key = (day: number) => `${year}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const inMonth = occ.filter((o) => o.start.slice(0, 7) === key(1).slice(0, 7) || (o.start < key(1) && o.end >= key(1)));
          const cells: (number | null)[] = [...Array<null>(first.getUTCDay()).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
          return (
            <section key={name} aria-label={`${name} ${year}`} className="min-w-0">
              <h3 className="text-body-strong text-fg">{name}</h3>
              <div role="grid" aria-label={`${name} ${year} calendar`} className="mt-2 grid grid-cols-7 gap-y-1 text-center text-caption">
                {DOW.map((d, i) => (
                  <span key={i} role="columnheader" className="pb-1 text-fg-subtle">{d}</span>
                ))}
                {cells.map((day, i) => {
                  if (!day) return <span key={i} role="gridcell" />;
                  const k = key(day);
                  const starts = occ.filter((o) => o.start === k);
                  const running = occ.some((o) => k > o.start && k <= o.end);
                  const lunar = starts.some((o) => o.festival.approximate);
                  return (
                    <span
                      key={i}
                      role="gridcell"
                      aria-label={starts.length ? `${name} ${day}: ${starts.map((s) => s.festival.name).join(", ")}${lunar ? " (approximate)" : ""}` : undefined}
                      className={cn("mx-auto flex size-8 items-center justify-center rounded-full tabular", running && !starts.length && "bg-bg-muted text-fg", starts.length ? (lunar ? "border-[1.5px] border-fg font-semibold text-fg" : "bg-fg font-semibold text-bg") : "text-fg-muted", k === today && !starts.length && "underline decoration-fg underline-offset-4")}
                    >
                      {day}
                    </span>
                  );
                })}
              </div>
              {inMonth.length ? (
                <ul className="mt-3 divide-y divide-line border-y border-line">
                  {inMonth.map((o) => (
                    <li key={o.festival.id} className="flex items-start justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <p className="text-meta-strong text-fg">{o.festival.name}</p>
                        <p className="text-meta text-fg-muted">
                          {short(o.start)}
                          {o.end !== o.start ? ` to ${short(o.end)}` : ""}
                          {o.festival.approximate ? ", approximate" : ""}
                        </p>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => setPlan(o)}>
                        Plan
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-meta text-fg-subtle">No festivals in the calendar this month.</p>
              )}
            </section>
          );
        })}
      </div>
      <Sheet open={!!plan} onClose={() => setPlan(null)} label="Plan a festival campaign" width={560} title={plan ? `${plan.festival.name} ${year}` : ""} subtitle={plan ? formatFestivalDate(plan.start) : undefined}>
        {plan ? <Plan occ={plan} year={year} today={today} /> : null}
      </Sheet>
    </div>
  );
}

function Plan({ occ, year, today }: { occ: Occ; year: number; today: string }) {
  const sends = sendDates(occ.festival, occ.start);
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Dot tone={occ.festival.approximate ? "info" : "positive"}>{occ.festival.approximate ? "Approximate, confirm locally" : "Fixed date"}</Dot>
        <p className="mt-1 text-meta text-fg-muted">{occ.festival.dateNote}</p>
      </div>
      <Section title="When to send">
        <ul className="divide-y divide-line border-y border-line">
          {sends.map((s) => (
            <li key={`${s.templateId}-${s.offsetDays}`} className="flex items-start justify-between gap-3 py-2.5 text-meta">
              <span className="min-w-0 text-fg">{s.label}</span>
              <span className="shrink-0 text-end tabular text-fg-muted">
                {short(s.date)}
                {s.repeatUntil ? ` to ${short(s.repeatUntil)}` : ""}
                {s.date < today && !(s.repeatUntil && s.repeatUntil >= today) ? <Tag className="ms-2">Passed</Tag> : null}
              </span>
            </li>
          ))}
        </ul>
      </Section>
      <Section title="Messages">
        <div className="flex flex-col gap-4">
          {occ.festival.templates.map((t) => (
            <TemplateCard key={t.id} festival={occ.festival} year={year} startDate={occ.start} template={t} />
          ))}
        </div>
      </Section>
    </div>
  );
}
