"use client";
import Link from "next/link";
import type { reportsApi } from "@ll/shared";
import { formatNumber } from "@/lib/format";
import { windowLabel } from "@/lib/dashboard/home";

/** A promo that ran today, judged against the same hours on the last four same weekdays. */
export function PromoResult({ promo, weekday, base }: { promo: NonNullable<reportsApi.TodayReportDto["promoWindow"]>; weekday: string; base: string }) {
  const hours = windowLabel(promo.startTime, promo.endTime).replace("–", " to ");
  return (
    <section aria-label="Promo result" className="flex flex-wrap items-center justify-between gap-x-8 gap-y-4 rounded-card border border-line px-5 py-[18px]">
      <div className="min-w-0 flex-1">
        <h2 className="text-[15px] font-semibold text-fg">
          <Link href={`${base}/promos`} className="hover:underline">{promo.title}</Link>
        </h2>
        <p className="mt-1 text-[13px] text-fg-muted">Ran today. Counted against the last four {weekday}s, {hours}.</p>
      </div>
      <dl className="flex items-start gap-8 text-center tabular">
        <Figure value={formatNumber(promo.windowVisits)} label="visits in the window" />
        <Figure value={formatNumber(promo.typicalVisits)} label="typical" />
        <Figure value={`${promo.extraVisits > 0 ? "+" : ""}${formatNumber(promo.extraVisits)}`} label="extra visits" tone={promo.extraVisits > 0 ? "good" : "plain"} />
      </dl>
    </section>
  );
}

function Figure({ value, label, tone = "plain" }: { value: string; label: string; tone?: "good" | "plain" }) {
  return (
    <div className="flex flex-col-reverse">
      <dt className="text-[12px] text-fg-muted">{label}</dt>
      <dd className={`text-[24px] font-semibold leading-8 tracking-[-0.01em] ${tone === "good" ? "text-positive-text" : "text-fg"}`}>{value}</dd>
    </div>
  );
}
