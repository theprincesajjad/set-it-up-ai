"use client";
import type { reportsApi } from "@ll/shared";
import { StatBlock, type StatItem } from "@/components/dashboard/kit";
import { formatNumber } from "@/lib/format";
import { formatTime } from "@/lib/format";
import { rewardNoun, vsTypical, type HomeMode } from "@/lib/dashboard/home";

/** Four numbers across the top of Home: 7 am answers "is today normal", at close "how was today". */
export function TodayStats({ mode, data, weekday, yesterdayWeekday, terminology, vertical, base, loading }: { mode: HomeMode; data: reportsApi.TodayReportDto | null; weekday: string; yesterdayWeekday: string; terminology: string; vertical?: string; base: string; loading?: boolean }) {
  const t = data?.today;
  const y = data?.yesterday;
  const noun = rewardNoun(vertical);
  const waiting = data?.rewardsWaiting;
  const goal = waiting?.goal ?? null;

  const items: StatItem[] =
    mode === "morning"
      ? [
          (() => {
            const d = y ? vsTypical(y.visits, y.typicalVisits, yesterdayWeekday) : null;
            return { label: "Yesterday", value: y ? `${formatNumber(y.visits)} ${y.visits === 1 ? "visit" : "visits"}` : "–", delta: d, caption: y && !d ? "No typical day to compare yet" : undefined };
          })(),
          { label: "New members yesterday", value: y ? formatNumber(y.newMembers) : "–", caption: y ? (y.newViaQr ? `${y.newViaQr} from the counter QR` : y.newMembers ? "Joined at the counter" : "Nobody joined") : undefined, href: `${base}/customers` },
          {
            label: `${noun[0]!.toUpperCase()}${noun.slice(1)}s waiting`,
            value: <span className="text-accent">{waiting ? formatNumber(waiting.count) : "–"}</span>,
            caption: goal ? `Members at ${goal}/${goal} who have not redeemed` : "Members with a reward ready",
            href: `${base}/customers?segment=reward`,
          },
          counterItem(data),
        ]
      : [
          (() => {
            const d = t ? vsTypical(t.visits, t.typicalVisitsFullDay, weekday) : null;
            return { label: "Visits today", value: t ? formatNumber(t.visits) : "–", delta: d, caption: t && !d ? "No typical day to compare yet" : undefined };
          })(),
          { label: "New members", value: t ? formatNumber(t.newMembers) : "–", caption: t ? joinCaption(t.newMembers, t.newViaQr) : undefined, href: `${base}/customers` },
          {
            label: `${terminology[0]!.toUpperCase()}${terminology.slice(1)} given · ${noun}s redeemed`,
            value: t ? `${formatNumber(t.stampsGiven)} · ${formatNumber(t.redemptions)}` : "–",
            caption: waiting ? (waiting.count ? `${waiting.count} still waiting on a ${noun}` : `No ${noun}s waiting`) : undefined,
          },
          { label: "Regulars who came in", value: t ? `${formatNumber(t.regularsSeen)} of ${formatNumber(t.regularsTotal)}` : "–", caption: t ? `${formatNumber(Math.max(0, t.regularsTotal - t.regularsSeen))} regulars did not visit today` : undefined, href: `${base}/customers?segment=regulars` },
        ];
  return <StatBlock label={mode === "morning" ? "Yesterday and this morning" : "Today so far"} loading={loading && !data} items={items} />;
}

function joinCaption(total: number, qr: number): string {
  if (!total) return "Nobody joined yet";
  const street = total - qr;
  return [qr ? `${qr} from the counter QR` : null, street ? `${street} from the street` : null].filter(Boolean).join(", ");
}

function counterItem(data: reportsApi.TodayReportDto | null): StatItem {
  const c = data?.counter;
  if (!c) return { label: "Counter app", value: "–" };
  const first = c.staffName?.split(" ")[0];
  return {
    label: "Counter app",
    value: <span className="text-[24px] leading-9">{c.online ? "Online" : "Offline"}</span>,
    delta: c.online ? { good: true, text: first && c.signedInAt ? `${first} signed in ${formatTime(c.signedInAt)} on the counter` : "Stamping now" } : null,
    caption: c.online ? undefined : "Nobody has signed in today",
  };
}
