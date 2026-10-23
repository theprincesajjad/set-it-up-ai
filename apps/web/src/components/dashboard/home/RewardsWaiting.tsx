"use client";
import type { reportsApi } from "@ll/shared";
import { formatPoints } from "@/lib/format";
import { lastSeen, rewardNoun } from "@/lib/dashboard/home";
import { ListSection } from "./ListSection";

/** Members at the goal who have not redeemed: the owner tells the counter before the rush. */
export function RewardsWaiting({ data, base, terminology, vertical, now, loading }: { data: reportsApi.TodayReportDto["rewardsWaiting"] | null; base: string; terminology: string; vertical?: string; now: Date; loading?: boolean }) {
  const noun = rewardNoun(vertical);
  return (
    <ListSection
      title={`${noun[0]!.toUpperCase()}${noun.slice(1)} waiting`}
      right={data ? `${data.count} member${data.count === 1 ? "" : "s"} · tell the counter` : null}
      loading={loading && !data}
      empty={`No one is waiting on a ${noun} right now.`}
      rows={(data?.members ?? []).map((m) => ({
        key: m.memberId,
        href: `${base}/customers?member=${m.memberId}`,
        title: m.name ?? "No name",
        meta: `${formatPoints(m.balance, terminology)} · in ${lastSeen(m.lastVisitAt, now)}`,
        trailing: <span className="text-accent-text">Ready</span>,
      }))}
    />
  );
}
