"use client";
import type { restaurantWebApi } from "@ll/shared";
import { Heading } from "./ui";
import { useFmt } from "./ui";
import { cn } from "@/lib/cn";
import { dayDate } from "@/lib/restaurant/util";

/** "this weekend": pots left for Saturday and Sunday, so a family sees a full day before they plan around it. */
export function WeekendPots({ weekend, items }: { weekend: restaurantWebApi.PublicRestaurantResponse["weekend"]; items: restaurantWebApi.PublicRestaurantResponse["preorderItems"] }) {
  const { t, date, pick, number } = useFmt();
  if (!weekend.length || !items.length) return null;
  const leads = items.map((i) => i.leadTimeHours);
  const lead = Math.max(...leads);
  const leadMin = Math.min(...leads);
  const names = items.slice(0, 2).map((i) => pick({ name: i.name, translations: i.translations }).name);
  const more = items.length - names.length;
  return (
    <section aria-labelledby="rs-weekend" className="flex flex-col gap-3">
      <Heading level={2}>
        <span id="rs-weekend">{t("rs.weekend.title")}</span>
      </Heading>
      <div className="rounded-card border border-line px-4">
        <ul className="divide-y divide-line">
          {weekend.map((w) => {
            const low = w.potsLeft !== null && w.potsLeft > 0 && w.potsLeft <= 3;
            return (
              <li key={w.date} className="flex items-baseline justify-between gap-3 py-3.5">
                <span className="text-body text-fg">{date(dayDate(w.date), { weekday: "short", month: "short", day: "numeric" }, "UTC")}</span>
                <span className={cn("text-body tabular-nums", low ? "text-points-text" : "text-fg-muted")}>
                  {w.closed ? t("rs.weekend.closed") : w.full ? t("rs.weekend.full") : w.potsLeft === null ? t("rs.weekend.open") : t("rs.weekend.potsLeft", { n: w.potsLeft })}
                </span>
              </li>
            );
          })}
        </ul>
        <p className="border-t border-line py-3 text-meta text-fg-muted">
          {names.join(", ")}
          {more > 0 ? ` ${t("rs.weekend.more", { n: more })}` : ""}. {leadMin < lead ? t("rs.weekend.noticeRange", { min: number(leadMin), max: number(lead) }) : t("rs.weekend.notice", { hours: lead })}
        </p>
      </div>
    </section>
  );
}
