import { addDays, festivalOccurrences, formatDate, type FestivalOccurrence, type Locale } from "@ll/shared";
import { restaurantCopy, type RestaurantSections } from "@/copy/restaurants-locales";
import { fill } from "@/lib/marketing/text";

const fmt = (d: string, weekday: boolean) => new Intl.DateTimeFormat("en-CA", { ...(weekday ? { weekday: "short" } : {}), month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));

/** The occasions a restaurant plans a campaign around: the big religious festivals, not every national day. */
export const MAJOR_FESTIVALS = ["ramadan", "eid_al_fitr", "eid_al_adha", "diwali", "vaisakhi", "gurpurab", "navratri", "holi"];

/** The next major festivals that start within `days` of `today` (YYYY-MM-DD), from the in-app festival calendar. */
export function upcomingFestivals(today: string, days = 120, limit = 4): FestivalOccurrence[] {
  return festivalOccurrences(today, addDays(today, days))
    .filter((o) => o.daysUntil >= 0 && o.daysUntil <= days && MAJOR_FESTIVALS.includes(o.festivalId))
    .slice(0, limit);
}

/** The date in the page's language (the shared formatter knows the Hindi, Urdu and Punjabi month and weekday names). */
function day(d: string, weekday: boolean, locale: Locale): string {
  if (locale === "en") return fmt(d, weekday);
  return formatDate(locale, `${d}T12:00:00Z`, { ...(weekday ? { weekday: "short" as const } : {}), month: "short", day: "numeric", year: "numeric" }, "UTC");
}

/** "Diwali · Sun, Nov 8, 2026" or, for moon-sighted dates, "Ramadan begins · about Feb 8, 2027", in the page's language. */
export function festivalLine(o: FestivalOccurrence, c: RestaurantSections = restaurantCopy("en"), locale: Locale = "en"): string {
  const islamic = o.tradition === "islamic";
  const name = c.festivalNames[o.festivalId] ?? o.name;
  return `${o.endDate ? fill(c.festivalBegins, { name }) : name} · ${islamic ? fill(c.festivalAbout, { date: day(o.startDate, false, locale) }) : day(o.startDate, true, locale)}`;
}

/** Festival rows (the next 120 days) with the campaign draft the app would prepare. Dates come from festivals.ts; moon-based dates are marked as estimates. */
export function FestivalList({ today, c = restaurantCopy("en"), locale = "en" }: { today: string; c?: RestaurantSections; locale?: Locale }) {
  const rows = upcomingFestivals(today);
  if (!rows.length) return null;
  return (
    <ul className="flex flex-col gap-3">
      {rows.map((o) => {
        // The campaign the app would draft. Its label is English, so another language shows the festival's greeting in that language.
        const send = locale === "en" ? o.sends[0]?.label : undefined;
        return (
          <li key={`${o.festivalId}-${o.year}`} className="rounded-card bg-card p-4 shadow-card">
            <p className="text-body-strong text-foreground">{festivalLine(o, c, locale)}</p>
            <p className="mt-0.5 text-meta text-muted-foreground">
              {send ?? o.greeting[locale] ?? c.festivalGreetings[o.festivalId] ?? o.greeting.en}
              {o.tradition === "islamic" ? ` ${c.festivalEstimate}` : ""}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
