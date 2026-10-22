"use client";
import { useState } from "react";
import { formatFestivalDate, getFestival, type FestivalSendDate } from "@ll/shared";
import { Dot, EmptyState, ErrorLine, PageHeader, PageTabs, SkeletonRows, Tag } from "@/components/dashboard";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { RestaurantGate, TierTeaser } from "@/components/dashboard/restaurant/shared";
import { Button } from "@/components/ui/Button";
import type { FestivalsUpcoming } from "@/lib/api/endpoints";
import { useApi } from "@/lib/dashboard/useApi";
import { TemplateCard } from "./TemplateCard";
import { YearCalendar } from "./YearCalendar";

export default function FestivalsPage() {
  return (
    <RestaurantGate featureKey="restaurant.festival_campaigns" title="Festival campaigns">
      <Festivals />
    </RestaurantGate>
  );
}

const short = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-CA", { month: "short", day: "numeric", timeZone: "UTC" });
const GREETING_LABEL = { hi: "Hindi", ur: "Urdu", pa: "Punjabi" } as const;

function Festivals() {
  const { api } = useMerchant();
  const [view, setView] = useState<"upcoming" | "year">("upcoming");
  const up = useApi(() => api.festivals.upcoming(90), [api]);
  if (up.status === 402) return <TierTeaser featureKey="restaurant.festival_campaigns" title="Festival campaigns" />;
  const today = up.data?.today ?? new Date().toISOString().slice(0, 10);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader flush title="Festivals" description="Eid, Diwali, Vaisakhi and the rest, with the right moment to tell your regulars and a message ready to send." />
      <PageTabs label="Festival views" value={view} onChange={setView} items={[{ id: "upcoming", label: "Next 90 days", count: up.data?.items.length ?? null }, { id: "year", label: "Full year" }]} />
      {view === "year" ? (
        <YearCalendar today={today} />
      ) : up.error && !up.data ? (
        <ErrorLine message={up.error} onRetry={() => void up.reload()} />
      ) : !up.data ? (
        <div aria-busy="true" aria-label="Loading">
          <SkeletonRows rows={6} />
        </div>
      ) : (
        <Timeline data={up.data} onYear={() => setView("year")} />
      )}
    </div>
  );
}

function when(daysUntil: number, endDate: string | null, today: string): string {
  if (daysUntil === 0) return "Today";
  if (daysUntil < 0) return endDate && endDate >= today ? "Under way" : "Started";
  if (daysUntil === 1) return "Tomorrow";
  return `In ${daysUntil} days`;
}

function sendLine(s: FestivalSendDate, today: string) {
  const passed = s.date < today && !(s.repeatUntil && s.repeatUntil >= today);
  const range = s.repeatUntil ? `${short(s.date)} to ${short(s.repeatUntil)}` : short(s.date);
  return { passed, range, now: s.date === today };
}

function Timeline({ data, onYear }: { data: FestivalsUpcoming; onYear: () => void }) {
  if (!data.items.length)
    return <EmptyState title="Nothing on the calendar for the next 90 days" description="Check the full year to plan ahead for Eid, Diwali and Vaisakhi." action={<Button size="sm" variant="secondary" onClick={onYear}>See the full year</Button>} />;
  return (
    <ol className="flex flex-col" aria-label="Upcoming festivals">
      {data.items.map((o) => {
        const def = getFestival(o.festivalId);
        const greetings = (["hi", "ur", "pa"] as const).filter((l) => data.languages.includes(l) && o.greeting[l]);
        const end = o.endDate;
        return (
          <li key={`${o.festivalId}-${o.year}`} className="grid gap-4 border-t border-line py-6 first:border-t-0 first:pt-2 md:grid-cols-[168px_minmax(0,1fr)] md:gap-8">
            <div className="flex items-baseline gap-3 md:flex-col md:gap-1">
              <p className="display text-[34px] leading-none tabular text-fg">{short(o.startDate)}</p>
              <p className="text-meta text-fg-muted">{when(o.daysUntil, end, data.today)}</p>
            </div>
            <div className="flex min-w-0 flex-col gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-headline text-fg">{o.name}</h2>
                  <Tag>{o.tradition === "national" ? "National" : o.tradition[0]!.toUpperCase() + o.tradition.slice(1)}</Tag>
                </div>
                <p className="mt-1 text-meta text-fg">
                  {formatFestivalDate(o.startDate)}
                  {end ? `, through ${formatFestivalDate(end)}` : ""}
                </p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-meta text-fg-muted">
                  {o.approximate ? <Dot tone="info">Approximate, confirm locally</Dot> : <Dot tone="positive">Fixed date</Dot>}
                  <span>{o.approximate ? o.dateNote.replace(/^Approximate, confirm locally:\s*/i, "") : ""}</span>
                </p>
                {greetings.length ? (
                  <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-meta text-fg-muted">
                    <span>{o.greeting.en}</span>
                    {greetings.map((l) => (
                      <span key={l} lang={l} dir={l === "ur" ? "rtl" : "ltr"} title={GREETING_LABEL[l]}>
                        {o.greeting[l]}
                      </span>
                    ))}
                  </p>
                ) : null}
              </div>
              <div>
                <h3 className="text-meta-strong text-fg">When to send</h3>
                <ul className="mt-1 divide-y divide-line border-y border-line">
                  {o.sends.map((s) => {
                    const l = sendLine(s, data.today);
                    return (
                      <li key={`${s.templateId}-${s.offsetDays}`} className={`flex items-start justify-between gap-3 py-2 text-meta ${l.passed ? "text-fg-subtle" : "text-fg"}`}>
                        <span className="min-w-0">{s.label}</span>
                        <span className="shrink-0 text-end tabular">
                          {l.range}
                          {l.now ? <Tag tone="accent" className="ms-2">Today</Tag> : null}
                          {l.passed ? <span className="ms-2 text-fg-subtle">passed</span> : null}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-1 text-caption text-fg-muted">
                  Sending dates are suggestions, counted from {short(o.startDate)}.{o.approximate ? " If the date moves by a day, move the send with it." : ""}
                </p>
              </div>
              {def ? (
                <div>
                  <h3 className="text-meta-strong text-fg">Messages ready to go</h3>
                  <div className="mt-2 grid gap-3 lg:grid-cols-2">
                    {def.templates.map((t) => (
                      <TemplateCard key={t.id} festival={def} year={o.year} startDate={o.startDate} template={t} />
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
