"use client";
import Link from "next/link";
import type { tiffinApi } from "@ll/shared";
import { useFmt } from "@/components/restaurant/ui";
import { dayDate } from "@/lib/restaurant/util";

/** The card's link to "My tiffin": each live subscription with its next meal, so a subscription lives in the wallet next to the points it earns. */
export function TiffinLinks({ items }: { items: tiffinApi.MySubscriptionDto[] }) {
  const { t, date } = useFmt();
  const live = items.filter((s) => s.status !== "cancelled");
  if (!live.length) return null;
  const status = (s: tiffinApi.MySubscriptionDto) =>
    s.status === "paused" ? t("tiffin.paused") : s.status === "pending" ? t("rc.tm.pending") : s.status === "past_due" ? t("rc.tm.pastDue") : s.nextDelivery ? t("tcb2.me.nextMeal", { date: date(dayDate(s.nextDelivery.date), { weekday: "short", month: "short", day: "numeric" }, "UTC") }) : t("tiffin.active");
  return (
    <nav aria-label={t("tcb2.me.tiffin")} className="flex flex-col divide-y divide-border rounded-card border border-border bg-card px-4">
      <p className="pt-3.5 text-meta-strong text-fg-muted">{t("tcb2.me.tiffin")}</p>
      {live.map((s) => (
        <Link key={s.id} href="/me/tiffin" className="flex items-center justify-between gap-3 py-3.5 text-fg">
          <span className="min-w-0">
            <span className="block truncate text-body-strong">{s.merchant.name}</span>
            <span className="block truncate text-meta text-fg-muted">{s.plan.name}</span>
          </span>
          <span className="shrink-0 text-meta text-fg-muted">{status(s)}</span>
        </Link>
      ))}
    </nav>
  );
}
