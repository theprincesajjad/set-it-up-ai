import { addDays, festivalOccurrences, type FestivalOccurrence } from "@ll/shared";

const fmt = (d: string, weekday: boolean) => new Intl.DateTimeFormat("en-CA", { ...(weekday ? { weekday: "short" } : {}), month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));

/** The occasions a restaurant plans a campaign around: the big religious festivals, not every national day. */
export const MAJOR_FESTIVALS = ["ramadan", "eid_al_fitr", "eid_al_adha", "diwali", "vaisakhi", "gurpurab", "navratri", "holi"];

/** The next major festivals that start within `days` of `today` (YYYY-MM-DD), from the in-app festival calendar. */
export function upcomingFestivals(today: string, days = 120, limit = 4): FestivalOccurrence[] {
  return festivalOccurrences(today, addDays(today, days))
    .filter((o) => o.daysUntil >= 0 && o.daysUntil <= days && MAJOR_FESTIVALS.includes(o.festivalId))
    .slice(0, limit);
}

/** "Diwali · Sun, Nov 8, 2026" or, for moon-sighted dates, "Ramadan begins · about Feb 8, 2027". */
export function festivalLine(o: FestivalOccurrence): string {
  const islamic = o.tradition === "islamic";
  return `${o.name}${o.endDate ? " begins" : ""} · ${islamic ? `about ${fmt(o.startDate, false)}` : fmt(o.startDate, true)}`;
}

/** Festival rows (the next 120 days) with the campaign draft the app would prepare. Dates come from festivals.ts; moon-based dates are marked as estimates. */
export function FestivalList({ today }: { today: string }) {
  const rows = upcomingFestivals(today);
  if (!rows.length) return null;
  return (
    <ul className="flex flex-col divide-y divide-line border-y border-line">
      {rows.map((o) => {
        const send = o.sends[0]?.label;
        return (
          <li key={`${o.festivalId}-${o.year}`} className="py-4">
            <p className="text-body-strong text-fg">{festivalLine(o)}</p>
            <p className="mt-0.5 text-meta text-fg-muted">
              {send ?? o.greeting.en}
              {o.tradition === "islamic" ? " (estimate)" : ""}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
